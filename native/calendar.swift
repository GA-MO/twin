import EventKit
import Foundation

let store = EKEventStore()
let sem = DispatchSemaphore(value: 0)
var granted = false
store.requestFullAccessToEvents { ok, _ in granted = ok; sem.signal() }
sem.wait()
guard granted else { FileHandle.standardError.write("no-access\n".data(using: .utf8)!); exit(2) }

let days = Int(CommandLine.arguments.dropFirst().first ?? "7") ?? 7
let start = Calendar.current.startOfDay(for: Date())
let end = Calendar.current.date(byAdding: .day, value: days, to: start)!
let iso = ISO8601DateFormatter()
let events = store.events(matching: store.predicateForEvents(withStart: start, end: end, calendars: nil)).map { e -> [String: Any] in
  [
    "title": e.title ?? "",
    "start": iso.string(from: e.startDate),
    "end": iso.string(from: e.endDate),
    "allDay": e.isAllDay,
    "calendar": e.calendar.title,
    "location": e.location ?? "",
    "url": e.url?.absoluteString ?? "",
    "notes": String((e.notes ?? "").prefix(2000)),
    "attendees": e.attendees?.count ?? 0,
  ]
}
let calendars = store.calendars(for: .event).map { "\($0.source.title)/\($0.title)" }
let out: [String: Any] = ["calendars": calendars, "events": events]
print(String(data: try! JSONSerialization.data(withJSONObject: out), encoding: .utf8)!)
