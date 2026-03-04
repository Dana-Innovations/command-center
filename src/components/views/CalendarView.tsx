"use client";
import { CalendarTimeline } from "@/components/command-center/CalendarTimeline";
import { MeetingPrep } from "@/components/command-center/MeetingPrep";
import { WeatherCard } from "@/components/command-center/WeatherCard";
import { useCalendar } from "@/hooks/useCalendar";
import { transformCalendarEvents, transformMeetingPrep } from "@/lib/transformers";

export function CalendarView() {
  const { events: calEvents } = useCalendar();
  const calTimeline = transformCalendarEvents(calEvents);
  const meetingPrep = transformMeetingPrep(calEvents);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5">
        <CalendarTimeline events={calTimeline} />
        <WeatherCard />
      </div>
      <MeetingPrep meetings={meetingPrep} />
    </div>
  );
}
