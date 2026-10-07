import AppKit
import EventKit
import Foundation
import Darwin

private struct HelperFailure: Error {
    let code: String
}

private struct CalendarRequest: Decodable {
    let action: String
    let start: String?
    let end: String?
    let calendarIds: [String]?
    let sourceIds: [String]?
    let sourceNames: [String]?
}

private struct CalendarListing: Encodable {
    let id: String
    let title: String
    let sourceId: String
    let sourceTitle: String
}

private struct BusyInterval: Encodable {
    let start: String
    let end: String
    let allDay: Bool
}

private struct CalendarResponse: Encodable {
    var calendars: [CalendarListing]? = nil
    var intervals: [BusyInterval]? = nil
    var error: String? = nil
}

private final class CalendarReader {
    private let store = EKEventStore()
    private let formatter: ISO8601DateFormatter = {
        let value = ISO8601DateFormatter()
        value.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        value.timeZone = TimeZone(secondsFromGMT: 0)
        return value
    }()

    func authorize() async throws {
        let status = EKEventStore.authorizationStatus(for: .event)
        if status == .denied || status == .restricted {
            throw HelperFailure(code: "calendar_access_denied")
        }
        let granted: Bool
        do {
            if #available(macOS 14.0, *) {
                if status == .fullAccess { granted = true }
                else { granted = try await store.requestFullAccessToEvents() }
            } else {
                if status == .authorized { granted = true }
                else {
                    granted = try await withCheckedThrowingContinuation { continuation in
                        store.requestAccess(to: .event) { allowed, error in
                            if error != nil {
                                continuation.resume(throwing: HelperFailure(code: "calendar_access_failed"))
                            } else { continuation.resume(returning: allowed) }
                        }
                    }
                }
            }
        } catch { throw HelperFailure(code: "calendar_access_failed") }
        guard granted else { throw HelperFailure(code: "calendar_access_denied") }
        store.refreshSourcesIfNecessary()
    }

    func listing() -> [CalendarListing] {
        store.calendars(for: .event).sorted {
            ($0.source.title, $0.title, $0.calendarIdentifier) < ($1.source.title, $1.title, $1.calendarIdentifier)
        }.map {
            CalendarListing(id: $0.calendarIdentifier, title: $0.title,
                            sourceId: $0.source.sourceIdentifier, sourceTitle: $0.source.title)
        }
    }

    private func date(_ text: String?) -> Date? {
        guard let text else { return nil }
        if let value = formatter.date(from: text) { return value }
        let plain = ISO8601DateFormatter()
        return plain.date(from: text)
    }

    func intervals(for request: CalendarRequest) throws -> [BusyInterval] {
        guard let start = date(request.start), let end = date(request.end), start < end,
              end.timeIntervalSince(start) <= 366 * 24 * 60 * 60 else {
            throw HelperFailure(code: "invalid_request")
        }
        let allCalendars = store.calendars(for: .event)
        let sourceIds = Set(request.sourceIds ?? [])
        let sourceNames = Set((request.sourceNames ?? ["iCloud"]).map { $0.lowercased() })
        let calendarIds = Set(request.calendarIds ?? [])
        guard !(sourceIds.contains("") || sourceNames.contains("") || calendarIds.contains("")) else {
            throw HelperFailure(code: "invalid_request")
        }
        let selectedSources: [EKSource]
        if !sourceIds.isEmpty {
            guard sourceIds.isSubset(of: Set(store.sources.map(\.sourceIdentifier))) else {
                throw HelperFailure(code: "calendar_source_missing")
            }
            selectedSources = store.sources.filter {
                $0.sourceType == .calDAV && sourceIds.contains($0.sourceIdentifier)
            }
            guard selectedSources.count == sourceIds.count else {
                throw HelperFailure(code: "calendar_source_missing")
            }
        } else {
            guard !sourceNames.isEmpty else { throw HelperFailure(code: "calendar_source_missing") }
            selectedSources = store.sources.filter {
                $0.sourceType == .calDAV && sourceNames.contains($0.title.lowercased())
            }
            guard sourceNames.isSubset(of: Set(selectedSources.map { $0.title.lowercased() })) else {
                throw HelperFailure(code: "calendar_source_missing")
            }
        }
        let selectedSourceIds = Set(selectedSources.map(\.sourceIdentifier))
        let sourceCalendars = allCalendars.filter { selectedSourceIds.contains($0.source.sourceIdentifier) }
        guard !sourceCalendars.isEmpty else { throw HelperFailure(code: "calendars_unavailable") }
        guard calendarIds.isSubset(of: Set(sourceCalendars.map(\.calendarIdentifier))) else {
            throw HelperFailure(code: "calendar_missing")
        }
        let calendars = sourceCalendars.filter { calendarIds.isEmpty || calendarIds.contains($0.calendarIdentifier) }
        var intervals: [BusyInterval] = []
        var seen = Set<String>()
        var cursor = start
        // EventKit expands recurring occurrences. Slice queries to stay below its four-year limit.
        while cursor < end {
            let next = min(cursor.addingTimeInterval(365 * 24 * 60 * 60), end)
            let predicate = store.predicateForEvents(withStart: cursor, end: next, calendars: calendars)
            for event in store.events(matching: predicate) {
                guard event.status != .canceled, event.availability != .free else { continue }
                guard let eventStart = event.startDate, let eventEnd = event.endDate else {
                    throw HelperFailure(code: "invalid_calendar_interval")
                }
                guard eventEnd >= eventStart else { throw HelperFailure(code: "invalid_calendar_interval") }
                // Keep overlapping and overnight events, including occurrences that started earlier.
                guard eventStart < end, eventEnd > start, eventStart < eventEnd else { continue }
                let startText = formatter.string(from: eventStart)
                let endText = formatter.string(from: eventEnd)
                let key = startText + "|" + endText + "|" + String(event.isAllDay)
                if seen.insert(key).inserted {
                    intervals.append(BusyInterval(start: startText, end: endText, allDay: event.isAllDay))
                    guard intervals.count <= 100_000 else { throw HelperFailure(code: "calendar_range_too_large") }
                }
            }
            cursor = next
        }
        return intervals.sorted { ($0.start, $0.end, $0.allDay ? 1 : 0) < ($1.start, $1.end, $1.allDay ? 1 : 0) }
    }
}

private final class CalendarHelperDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        // Bound a hung permission/service request; no private exception payload is logged.
        DispatchQueue.global().asyncAfter(deadline: .now() + 110) { exit(75) }
        Task { @MainActor in
            let response: CalendarResponse
            do {
                let data = FileHandle.standardInput.readDataToEndOfFile()
                guard data.count <= 65_536 else { throw HelperFailure(code: "invalid_request") }
                let request: CalendarRequest
                do { request = try JSONDecoder().decode(CalendarRequest.self, from: data) }
                catch { throw HelperFailure(code: "invalid_request") }
                guard request.action == "list" || request.action == "busy" else {
                    throw HelperFailure(code: "invalid_request")
                }
                let reader = CalendarReader()
                try await reader.authorize()
                if request.action == "list" { response = CalendarResponse(calendars: reader.listing()) }
                else { response = CalendarResponse(intervals: try reader.intervals(for: request)) }
            } catch let error as HelperFailure { response = CalendarResponse(error: error.code) }
            catch { response = CalendarResponse(error: "calendar_read_failed") }
            do {
                try FileHandle.standardOutput.write(contentsOf: JSONEncoder().encode(response))
                exit(response.error == nil ? 0 : 1)
            } catch {
                FileHandle.standardError.write(Data("Cannot return Calendar helper response.\n".utf8))
                exit(1)
            }
        }
    }
}

@main
struct CalendarHelper {
    static func main() {
        let application = NSApplication.shared
        let delegate = CalendarHelperDelegate()
        application.delegate = delegate
        application.setActivationPolicy(.accessory)
        withExtendedLifetime(delegate) { application.run() }
    }
}
