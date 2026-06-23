import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard, Badge } from "@/components/app-shell";
import { getStatusColor } from "@/lib/pla";

export const Route = createFileRoute("/_app/schedule")({
  component: SchedulePage,
});

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function SchedulePage() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["my-schedule", user?.linked_entity_id],
    queryFn: async () => {
      if (!user?.linked_entity_id) return [];
      const { data } = await supabase
        .from("course_enrollments")
        .select("courses(id,name,room,schedule_days,start_time,end_time,status,programs(name),instructors(first_name,last_name))")
        .eq("student_id", user.linked_entity_id);
      return (data ?? []).map((e: any) => e.courses).filter(Boolean);
    },
  });

  return (
    <div className="space-y-4">
      <PageCard title="My Weekly Schedule">
        <div className="grid gap-2 md:grid-cols-7">
          {DAYS.map((d) => (
            <div key={d} className="border border-border rounded-lg p-2 min-h-[140px]">
              <div className="text-xs font-bold text-accent text-center mb-2">{d}</div>
              {(data ?? []).filter((c) => c.schedule_days?.includes(d)).map((c) => (
                <div key={c.id} className="bg-primary/40 rounded p-2 mb-1 text-xs">
                  <div className="font-semibold">{c.name}</div>
                  <div className="opacity-70">{c.start_time?.slice(0,5)}–{c.end_time?.slice(0,5)}</div>
                  <div className="opacity-70">Rm {c.room}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </PageCard>

      <PageCard title="My Courses">
        <div className="grid md:grid-cols-2 gap-3">
          {(data ?? []).map((c) => (
            <div key={c.id} className="border border-border rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.programs?.name}</div>
                </div>
                <Badge className={getStatusColor(c.status)}>{c.status}</Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-2">Instructor: {c.instructors?.first_name} {c.instructors?.last_name}</div>
            </div>
          ))}
          {!data?.length && <div className="md:col-span-2 text-center text-muted-foreground py-6">No enrollments.</div>}
        </div>
      </PageCard>
    </div>
  );
}
