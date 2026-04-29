import { useGetDashboardSummary, useListActivity } from "@workspace/api-client-react";
import { Activity, Clock, CheckCircle2, ListTodo, Users, Calendar as CalendarIcon, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary();
  const { data: activity, isLoading: isActivityLoading } = useListActivity({ limit: 20 });

  return (
    <div className="p-8 h-full overflow-y-auto">
      <h1 className="text-2xl font-mono tracking-tight font-semibold mb-6 uppercase">System Overview</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard 
          title="Active Tasks" 
          value={summary?.activeTaskCount} 
          icon={ListTodo} 
          isLoading={isSummaryLoading} 
        />
        <MetricCard 
          title="Pending Tasks" 
          value={summary?.pendingTaskCount} 
          icon={Clock} 
          isLoading={isSummaryLoading} 
          trend="warning"
        />
        <MetricCard 
          title="Upcoming Events" 
          value={summary?.upcomingEventCount} 
          icon={CalendarIcon} 
          isLoading={isSummaryLoading} 
        />
        <MetricCard 
          title="Active Agents" 
          value={summary?.activeAgentCount} 
          icon={Users} 
          isLoading={isSummaryLoading} 
          trend="good"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="border border-border bg-card rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <h3 className="font-mono text-sm uppercase text-muted-foreground flex items-center">
                <Activity className="w-4 h-4 mr-2" /> Live Activity Feed
              </h3>
            </div>
            <div className="p-0">
              {isActivityLoading ? (
                <div className="p-4 space-y-4">
                  {[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : activity?.length ? (
                <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
                  {activity.map(entry => (
                    <div key={entry.id} className="flex items-start p-4 hover:bg-muted/20 transition-colors">
                      <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                        entry.status === 'active' ? 'bg-primary shadow-[0_0_8px_rgba(0,212,255,0.8)]' :
                        entry.status === 'pending' ? 'bg-yellow-500' :
                        entry.status === 'error' ? 'bg-destructive' :
                        'bg-muted-foreground'
                      }`} />
                      <div className="ml-4 flex-1">
                        <div className="flex justify-between items-baseline mb-1">
                          <span className="font-semibold text-sm">{entry.agentName}</span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {new Date(entry.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm text-foreground/80">{entry.action}</p>
                        {entry.detail && (
                          <p className="text-xs text-muted-foreground mt-1 font-mono">{entry.detail}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground text-sm">No recent activity</div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="border border-border bg-card rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <h3 className="font-mono text-sm uppercase text-muted-foreground flex items-center">
                <FileText className="w-4 h-4 mr-2" /> Content Pipeline
              </h3>
            </div>
            <div className="p-4">
              {isSummaryLoading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : summary?.contentByStage && summary.contentByStage.length > 0 ? (
                <div className="space-y-3">
                  {summary.contentByStage.map(stage => (
                    <div key={stage.stage} className="flex items-center justify-between text-sm">
                      <span className="capitalize text-foreground/80">{stage.stage}</span>
                      <span className="font-mono bg-secondary px-2 py-0.5 rounded text-xs">
                        {stage.count}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground text-sm">No active content</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, isLoading, trend }: { title: string, value?: number, icon: any, isLoading: boolean, trend?: "good" | "warning" }) {
  return (
    <div className="border border-border bg-card rounded-lg p-5 flex flex-col">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-muted-foreground text-xs font-mono uppercase tracking-wider">{title}</h3>
        <Icon className={`w-4 h-4 ${trend === 'good' ? 'text-primary' : trend === 'warning' ? 'text-yellow-500' : 'text-muted-foreground'}`} />
      </div>
      <div className="mt-auto">
        {isLoading ? (
          <Skeleton className="h-10 w-16" />
        ) : (
          <span className="text-3xl font-light tracking-tight">{value ?? 0}</span>
        )}
      </div>
    </div>
  );
}
