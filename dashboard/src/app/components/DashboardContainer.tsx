"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Users,
  Activity,
  Image as ImageIcon,
  Clock,
  LogOut,
  MousePointer,
  Keyboard,
  Compass,
  ArrowRight,
  Eye,
  Calendar,
  AlertTriangle,
  RotateCw,
  Search,
  CheckCircle2,
  X,
  Home,
  Bell,
  TrendingUp,
  Sliders,
  Check
} from "lucide-react"

interface Session {
  email: string
  name: string
  role: string
}

interface TeamMember {
  email: string
  name: string
  role: string
  eventCount: number
  screenshotCount: number
  lastActive: string | null
  isTrackingActive: boolean
  currentStatus: "active" | "idle" | "offline"
  lastActiveText: string
  lastEventText: string
  lastUrl: string
  lastTitle: string
  sessionTimeTodayMs?: number
  activeTimeTodayMs?: number
  pauseCountToday?: number
  tasksStartedToday?: number
  tasksSkippedToday?: number
  focusRatioToday?: number
}

interface EventDist {
  event_type: string
  count: number
}

interface HourlyAct {
  hour: string;
  count: number;
}

interface ActivityLog {
  id: number
  email: string
  event_type: string
  url: string
  title: string
  timestamp: string
  metadata: any
}

interface Screenshot {
  id: number
  email: string
  url: string
  title: string
  timestamp: string
  imageUrl: string
}

interface KPIStats {
  totalAnnotatorsToday: number
  teamActiveTimeTodayMs: number
  tasksStartedToday: number
  tasksSkippedToday: number
  skipRateToday: number
  focusRatioToday: number
  avgSessionDurationTodayMs: number
}

interface SparklineData {
  data: number[]
  labels: string[]
}

interface AlertItem {
  id: string
  type: "info" | "warning" | "critical"
  title: string
  description: string
  time: string
}

export default function DashboardContainer({ session }: { session: Session }) {
  const [activeTab, setActiveTab] = useState<"dashboard" | "team" | "timeline">("dashboard")
  const [selectedUser, setSelectedUser] = useState<string>("")
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [eventDistribution, setEventDistribution] = useState<EventDist[]>([])
  const [hourlyActivity, setHourlyActivity] = useState<HourlyAct[]>([])
  const [timelineLogs, setTimelineLogs] = useState<ActivityLog[]>([])
  const [timelineStats, setTimelineStats] = useState<EventDist[]>([])
  
  // Home Dashboard Specific States
  const [kpis, setKpis] = useState<KPIStats | null>(null)
  const [sparkline, setSparkline] = useState<SparklineData | null>(null)
  const [alerts, setAlerts] = useState<AlertItem[]>([])

  // Individual Profile States
  const [profileTaskEvents, setProfileTaskEvents] = useState<any[]>([])
  const [profileDomainTime, setProfileDomainTime] = useState<Record<string, number>>({})
  const [profileEncordCategoryTime, setProfileEncordCategoryTime] = useState<Record<string, number>>({
    home: 0,
    projects: 0,
    project_view: 0,
    label_editor: 0,
    other: 0
  })
  const [profileTimelineEvents, setProfileTimelineEvents] = useState<any[]>([])
  
  // Loading & Error States
  const [isLoadingOverview, setIsLoadingOverview] = useState(true)
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  
  // Filtering & Sorting States for Team Overview
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "offline">("all")
  const [sortBy, setSortBy] = useState<keyof TeamMember>("name")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc")

  const handleSort = (field: keyof TeamMember) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortBy(field)
      setSortOrder(field === "name" ? "asc" : "desc")
    }
  }

  const router = useRouter()

  // Load Overview Data on mount
  useEffect(() => {
    fetchOverviewData()
  }, [])

  // Load Timeline Data when user selection / tab changes
  useEffect(() => {
    if (activeTab === "timeline" && selectedUser) {
      fetchTimelineData(selectedUser)
    }
  }, [activeTab, selectedUser])

  const fetchOverviewData = async () => {
    setIsLoadingOverview(true)
    setErrorMsg(null)
    try {
      const res = await fetch("/api/telemetry/overview")
      if (!res.ok) throw new Error("Failed to load overview data.")
      const data = await res.json()
      setTeamMembers(data.teamMembers || [])
      setEventDistribution(data.eventDistribution || [])
      setHourlyActivity(data.hourlyActivity || [])
      setKpis(data.kpis || null)
      setSparkline(data.sparkline || null)
      setAlerts(data.alerts || [])
      
      // Auto-select first user if none selected
      if (data.teamMembers && data.teamMembers.length > 0 && !selectedUser) {
        setSelectedUser(data.teamMembers[0].email)
      }
    } catch (err: any) {
      setErrorMsg(err.message)
    } finally {
      setIsLoadingOverview(false)
    }
  }

  const fetchTimelineData = async (email: string) => {
    setIsLoadingTimeline(true)
    try {
      const res = await fetch(`/api/telemetry/timeline?email=${encodeURIComponent(email)}`)
      if (!res.ok) throw new Error("Failed to load timeline logs.")
      const data = await res.json()
      setTimelineLogs(data.logs || [])
      setTimelineStats(data.stats || [])
      setProfileTaskEvents(data.taskEvents || [])
      setProfileDomainTime(data.domainTime || {})
      setProfileEncordCategoryTime(data.encordCategoryTime || {
        home: 0,
        projects: 0,
        project_view: 0,
        label_editor: 0,
        other: 0
      })
      setProfileTimelineEvents(data.todayTimelineEvents || [])
    } catch (err: any) {
      console.error(err)
    } finally {
      setIsLoadingTimeline(false)
    }
  }


  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
      router.push("/login")
      router.refresh()
    } catch (err) {
      console.error("Logout failed:", err)
    }
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case "MOUSE_CLICK":
        return <MousePointer className="w-4 h-4 text-emerald-400" />
      case "KEYBOARD_INPUT":
      case "KEYBOARD_SHORTCUT":
        return <Keyboard className="w-4 h-4 text-cyan-400" />
      case "SCREENSHOT_CAPTURED":
        return <ImageIcon className="w-4 h-4 text-pink-400" />
      case "TAB_ACTIVATED":
      case "TAB_UPDATED":
      case "TAB_CLOSED":
        return <Compass className="w-4 h-4 text-blue-400" />
      default:
        return <Activity className="w-4 h-4 text-slate-400" />
    }
  }

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString)
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    } catch (e) {
      return isoString
    }
  }

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString)
      return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
    } catch (e) {
      return isoString
    }
  }

  const formatDurationMs = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000)
    const hrs = Math.floor(totalSecs / 3600)
    const mins = Math.floor((totalSecs % 3600) / 60)
    const secs = totalSecs % 60
    
    const parts = []
    if (hrs > 0) parts.push(`${hrs}h`)
    if (mins > 0) parts.push(`${mins}m`)
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)
    return parts.join(" ")
  }


  // Filter blocklist screenshots
  const isBlockedTab = (url: string | null) => {
    if (!url) return false
    return url.includes("whatsapp.com") || url.includes("instagram.com")
  }

  // Calculate statistics
  const totalLogsCount = teamMembers.reduce((acc, curr) => acc + curr.eventCount, 0)
  const activeMembers = teamMembers.filter(m => m.isTrackingActive).length
  const totalScreenshotsCount = teamMembers.reduce((acc, curr) => acc + curr.screenshotCount, 0)

  // Filter and Sort Team Members for Overview Table
  const filteredAndSortedMembers = teamMembers
    .filter(member => {
      const query = searchQuery.toLowerCase().trim()
      const matchesSearch = 
        member.name.toLowerCase().includes(query) || 
        member.email.toLowerCase().includes(query)
      
      const matchesStatus = 
        statusFilter === "all" ||
        (statusFilter === "active" && member.isTrackingActive) ||
        (statusFilter === "offline" && !member.isTrackingActive)
        
      return matchesSearch && matchesStatus
    })
    .sort((a, b) => {
      let valA = a[sortBy]
      let valB = b[sortBy]

      if (sortBy === "lastActive") {
        const timeA = valA ? new Date(valA as any).getTime() : 0
        const timeB = valB ? new Date(valB as any).getTime() : 0
        return sortOrder === "asc" ? timeA - timeB : timeB - timeA
      }

      if (typeof valA === "string" && typeof valB === "string") {
        return sortOrder === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA)
      } else {
        const aNum = Number(valA)
        const bNum = Number(valB)
        return sortOrder === "asc" ? aNum - bNum : bNum - aNum
      }
    })

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.03),transparent_50%)] pointer-events-none" />

      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-205 border-slate-200 flex flex-col">
        {/* Brand Header */}
        <div className="p-6 border-b border-slate-200 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-center text-blue-600">
            <Clock className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h1 className="text-md font-bold tracking-tight text-slate-900 flex items-center gap-1.5">
              WorkWise <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full border border-blue-150 border-blue-200/80">Console</span>
            </h1>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
              activeTab === "dashboard"
                ? "bg-blue-50 border border-blue-100/50 text-blue-600 font-semibold"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Home className="w-4 h-4" />
            <span>Overview (Home)</span>
          </button>

          <button
            onClick={() => setActiveTab("team")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
              activeTab === "team"
                ? "bg-blue-50 border border-blue-100/50 text-blue-600 font-semibold"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Team Overview</span>
          </button>

          <button
            onClick={() => setActiveTab("timeline")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
              activeTab === "timeline"
                ? "bg-blue-50 border border-blue-100/50 text-blue-600 font-semibold"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Employee Timelines</span>
          </button>

        </nav>

        {/* Profile Footer */}
        <div className="p-4 border-t border-slate-200 space-y-4">
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 border border-blue-100 rounded-full flex items-center justify-center font-bold text-blue-600 text-sm">
              {session.name ? session.name.substring(0, 2).toUpperCase() : "AD"}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-slate-800 truncate">{session.name || "Administrator"}</p>
              <p className="text-[10px] text-slate-500 truncate" title={session.email}>{session.email}</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border border-slate-200 hover:border-red-200 hover:bg-red-50 text-slate-600 hover:text-red-600 transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Log Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-y-auto">
        {/* Top bar header */}
        <header className="h-16 border-b border-slate-200 px-8 flex items-center justify-between shrink-0 bg-white/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest">
              {activeTab === "dashboard" && "🏠 Operations Command Center"}
              {activeTab === "team" && "👥 Team Performance Roster"}
              {activeTab === "timeline" && "⌛ Employee Timeline Detailed Logs"}
            </h2>
          </div>
          {/* User selection sync bar for subtabs */}
          {activeTab === "timeline" && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Focus User:</span>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="bg-white border border-slate-200 text-slate-700 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-blue-500/30 cursor-pointer animate-fade-in"
              >
                {teamMembers.map(member => (
                  <option key={member.email} value={member.email}>
                    {member.name || member.email}
                  </option>
                ))}
              </select>
              <button 
                onClick={() => {
                  fetchTimelineData(selectedUser)
                }}
                className="p-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                title="Refresh logs"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {(activeTab === "dashboard" || activeTab === "team") && (
            <button 
              onClick={fetchOverviewData}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Refresh Data</span>
            </button>
          )}
        </header>

        {/* Dashboard Panels */}
        <div className="flex-1 p-8 space-y-6">
          {errorMsg && (
            <div className="bg-red-50 border border-red-200/60 rounded-xl p-4 flex items-start gap-3 text-red-600 text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Unable to fetch dashboard telemetry</p>
                <p className="text-xs text-red-600/80 mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* ========================================================
              OVERVIEW TAB
             ======================================================== */}
          {activeTab === "dashboard" && (
            <>
              {isLoadingOverview ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
                  <RotateCw className="w-8 h-8 animate-spin text-blue-600" />
                  <span className="text-sm">Initializing command center...</span>
                </div>
              ) : (
                <div className="space-y-8 animate-fade-in">
                  {/* Real-time Team Activity Strip */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-slate-100/50">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Live Activity Feed</h4>
                        <p className="text-[10px] text-slate-500">Real-time status updates from active extension clients</p>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-ping" />
                          {teamMembers.filter(m => m.currentStatus === "active").length} Active
                        </span>
                        <span className="flex items-center gap-1.5 text-amber-600 font-medium">
                          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                          {teamMembers.filter(m => m.currentStatus === "idle").length} Idle
                        </span>
                        <span className="flex items-center gap-1.5 text-slate-500 font-medium">
                          <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
                          {teamMembers.filter(m => m.currentStatus === "offline").length} Offline
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-72 overflow-y-auto pr-2">
                      {teamMembers.map(member => (
                        <div 
                          key={member.email}
                          onClick={() => {
                            setSelectedUser(member.email)
                            setActiveTab("timeline")
                          }}
                          className="bg-slate-50/50 border border-slate-200 hover:border-blue-200 hover:bg-blue-50/30 rounded-xl p-3 flex items-center gap-3 transition-all cursor-pointer group"
                        >
                          {/* Avatar status ring */}
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 border-2 ${
                            member.currentStatus === "active" ? "border-emerald-200 text-emerald-600 bg-emerald-50" :
                            member.currentStatus === "idle" ? "border-amber-200 text-amber-600 bg-amber-50" :
                            "border-slate-205 border-slate-200 text-slate-500 bg-slate-100"
                          }`}>
                            {member.name.substring(0, 2).toUpperCase()}
                          </div>

                          <div className="overflow-hidden flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-xs font-bold text-slate-700 truncate group-hover:text-blue-600 transition-colors">{member.name}</p>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                member.currentStatus === "active" ? "bg-emerald-500" :
                                member.currentStatus === "idle" ? "bg-amber-500" : "bg-slate-400"
                              }`} />
                            </div>
                            <p className="text-[9px] text-slate-500 truncate" title={member.email}>{member.email}</p>
                            <p className="text-[9px] text-slate-600 truncate mt-1 italic font-light">
                              {member.currentStatus === "active" ? (
                                member.lastTitle ? `Viewing: ${member.lastTitle}` : "Active now"
                              ) : member.currentStatus === "idle" ? (
                                "Away / Idle"
                              ) : "Offline"}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Operations KPI Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                    {/* Active Annotators Today */}
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-6 relative overflow-hidden shadow-sm shadow-slate-100/50">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-slate-505 text-slate-500 text-xs font-semibold uppercase tracking-wider">Active Today</span>
                        <div className="w-8 h-8 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center justify-center text-emerald-600">
                          <Users className="w-4 h-4" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-slate-800">
                        {kpis?.totalAnnotatorsToday || 0} <span className="text-xs font-normal text-slate-500">/ {teamMembers.length}</span>
                      </h3>
                      <p className="text-slate-500 text-[10px] mt-1.5">Logged session load today</p>
                    </div>

                    {/* Team Production Time Today */}
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-6 relative overflow-hidden shadow-sm shadow-slate-100/50">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-slate-550 text-slate-500 text-xs font-semibold uppercase tracking-wider">Team Active Time</span>
                        <div className="w-8 h-8 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                          <Clock className="w-4 h-4" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-slate-800">
                        {(() => {
                          const ms = kpis?.teamActiveTimeTodayMs || 0
                          const totalSecs = Math.floor(ms / 1000)
                          const hrs = Math.floor(totalSecs / 3600)
                          const mins = Math.floor((totalSecs % 3600) / 60)
                          const secs = totalSecs % 60
                          const parts = []
                          if (hrs > 0) parts.push(`${hrs}h`)
                          if (mins > 0) parts.push(`${mins}m`)
                          if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)
                          return parts.join(" ")
                        })()}
                      </h3>
                      <p className="text-slate-500 text-[10px] mt-1.5">Accumulated focus hours today</p>
                    </div>

                    {/* Tasks Started Today */}
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-6 relative overflow-hidden shadow-sm shadow-slate-100/50">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-slate-550 text-slate-500 text-xs font-semibold uppercase tracking-wider">Tasks Started Today</span>
                        <div className="w-8 h-8 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                          <Activity className="w-4 h-4" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-slate-800">
                        {kpis?.tasksStartedToday || 0}
                      </h3>
                      <p className="text-slate-500 text-[10px] mt-1.5">Total tasks loaded in editor</p>
                    </div>

                    {/* Tasks Skipped Today */}
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-6 relative overflow-hidden shadow-sm shadow-slate-100/50">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-slate-550 text-slate-500 text-xs font-semibold uppercase tracking-wider">Tasks Skipped Today</span>
                        <div className="w-8 h-8 bg-amber-50 border border-amber-100 rounded-lg flex items-center justify-center text-amber-600">
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-slate-800">
                        {kpis?.tasksSkippedToday || 0}
                      </h3>
                      <p className="text-slate-500 text-[10px] mt-1.5">Skipped labeling tasks</p>
                    </div>

                    {/* Average Focus Ratio */}
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-6 relative overflow-hidden shadow-sm shadow-slate-100/50">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-slate-550 text-slate-500 text-xs font-semibold uppercase tracking-wider">Avg Focus Ratio</span>
                        <div className="w-8 h-8 bg-purple-50 border border-purple-100 rounded-lg flex items-center justify-center text-purple-600">
                          <TrendingUp className="w-4 h-4" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-slate-800">
                        {kpis?.focusRatioToday || 0}%
                      </h3>
                      <div className="w-full bg-slate-100 border border-slate-200/60 h-1.5 rounded-full overflow-hidden mt-1.5">
                        <div 
                          style={{ width: `${kpis?.focusRatioToday || 0}%` }}
                          className="bg-purple-500 h-full rounded-full"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Main Grid for Sparkline + System Alerts */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Weekly Productivity Sparkline */}
                    <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-slate-100/50">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Weekly Task Skips</h4>
                          <span className="text-[10px] text-slate-500">Tasks skipped over the last 7 days</span>
                        </div>
                        <TrendingUp className="w-4 h-4 text-slate-500" />
                      </div>


                      {sparkline && sparkline.data.length > 0 ? (
                        <div className="h-60 flex flex-col justify-between">
                          <div className="h-44 w-full flex items-end justify-between px-2 gap-4">
                            {(() => {
                              const maxVal = Math.max(...sparkline.data, 5)
                              return sparkline.data.map((val, idx) => {
                                const heightPercent = (val / maxVal) * 100
                                return (
                                  <div key={idx} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                                    <div className="relative w-full flex justify-center">
                                      <span className="absolute -top-7 scale-0 group-hover:scale-100 bg-white border border-slate-200 shadow-md text-slate-800 px-2 py-0.5 rounded text-[10px] font-bold transition-all z-10">
                                        {val} tasks
                                      </span>
                                    </div>
                                    <div 
                                      style={{ height: `${heightPercent}%` }}
                                      className="w-full max-w-[40px] bg-gradient-to-t from-blue-100 to-blue-500 hover:to-blue-600 border border-blue-200 hover:border-blue-400 rounded-lg transition-all duration-300 cursor-pointer"
                                    />
                                    <span className="text-[9px] text-slate-500 uppercase tracking-widest mt-1">
                                      {sparkline.labels[idx]}
                                    </span>
                                  </div>
                                )
                              })
                            })()}
                          </div>
                        </div>
                      ) : (
                        <div className="h-44 flex items-center justify-center text-slate-500 text-xs border border-slate-200 border-dashed rounded-xl">
                          No historical task data found.
                        </div>
                      )}
                    </div>

                    {/* Operational Alerts feed */}
                    <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-slate-100/50 flex flex-col">
                      <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-3">
                        <div className="flex items-center gap-2">
                          <Bell className="w-4 h-4 text-amber-500 animate-bounce" />
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Alert Center</h4>
                        </div>
                        <span className="text-[9px] bg-slate-50 border border-slate-200/50 px-2 py-0.5 rounded-full text-slate-500 font-semibold">
                          {alerts.length} Today
                        </span>
                      </div>

                      <div className="flex-1 overflow-y-auto max-h-[15rem] space-y-3 pr-1">
                        {alerts.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs py-10">
                            <Check className="w-8 h-8 text-emerald-600 mb-2 bg-emerald-50 border border-emerald-100 rounded-full p-1.5" />
                            <span>Operations optimal. No active alerts.</span>
                          </div>
                        ) : (
                          alerts.map(alert => (
                            <div 
                              key={alert.id}
                              className={`border rounded-xl p-3 flex gap-2.5 text-xs transition-all ${
                                alert.type === "critical" ? "bg-red-50 border-red-200/60 text-red-700" :
                                alert.type === "warning" ? "bg-amber-50 border-amber-200/60 text-amber-700" :
                                "bg-blue-50 border-blue-200/60 text-blue-700"
                              }`}
                            >
                              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 animate-pulse" />
                              <div className="space-y-0.5">
                                <p className="font-bold text-slate-800">{alert.title}</p>
                                <p className="text-[10px] leading-relaxed opacity-90">{alert.description}</p>
                                <span className="text-[8px] opacity-60 uppercase font-semibold tracking-wider block mt-1">
                                  {alert.time}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ========================================================
              TEAM OVERVIEW TAB
             ======================================================== */}
          {activeTab === "team" && (
            <>
              {isLoadingOverview ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
                  <RotateCw className="w-8 h-8 animate-spin text-blue-600" />
                  <span className="text-sm">Loading summary metrics...</span>
                </div>
              ) : (
                <div className="space-y-6 animate-fade-in">
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 relative overflow-hidden shadow-sm shadow-slate-100/50">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Active Team</span>
                        <div className="w-8 h-8 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center justify-center text-emerald-600">
                          <Users className="w-4 h-4" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-slate-800">{activeMembers} / {teamMembers.length}</h3>
                      <p className="text-slate-500 text-[10px] mt-1.5 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-ping" />
                        <span>Currently active tracking sessions</span>
                      </p>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl p-6 relative overflow-hidden shadow-sm shadow-slate-100/50">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Total Events logs</span>
                        <div className="w-8 h-8 bg-cyan-50 border border-cyan-100 rounded-lg flex items-center justify-center text-cyan-600">
                          <Activity className="w-4 h-4" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-slate-800">{totalLogsCount.toLocaleString()}</h3>
                      <p className="text-slate-500 text-[10px] mt-1.5">Accumulated clicks and keyboard inputs</p>
                    </div>


                    <div className="bg-white border border-slate-200 rounded-2xl p-6 relative overflow-hidden shadow-sm shadow-slate-100/50">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Telemetry Location</span>
                        <div className="w-8 h-8 bg-purple-50 border border-purple-100 rounded-lg flex items-center justify-center text-purple-600">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                      </div>
                      <h3 className="text-base font-bold text-slate-800 truncate">shared-telemetry.db</h3>
                      <p className="text-slate-500 text-[10px] mt-1.5 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        <span>SQLite database local cache isolation</span>
                      </p>
                    </div>
                  </div>

                  {/* Team Members List */}
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm shadow-slate-100/50">
                    <div className="px-6 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Employee Logging Status</h4>
                        <span className="text-[10px] text-slate-500">Master whitelist synced from Neon PostgreSQL DB</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {/* Search Input */}
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="Search employee..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-slate-50 border border-slate-200 focus:border-blue-500/50 focus:bg-white rounded-xl pl-9 pr-4 py-1.5 text-xs text-slate-800 placeholder-slate-400 outline-none w-48 transition-all"
                          />
                        </div>
                        {/* Status Select Filter */}
                        <select
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value as any)}
                          className="bg-white border border-slate-200 focus:border-blue-500/50 rounded-xl px-3 py-1.5 text-xs text-slate-700 outline-none cursor-pointer transition-all"
                        >
                          <option value="all">All Statuses</option>
                          <option value="active">Active Only</option>
                          <option value="offline">Offline Only</option>
                        </select>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider select-none">
                            <th className="px-4 py-4 cursor-pointer hover:text-slate-900 transition-colors" onClick={() => handleSort("name")}>
                              <div className="flex items-center gap-1">
                                <span>Employee</span>
                                <span className="text-[10px] opacity-75">{sortBy === "name" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}</span>
                              </div>
                            </th>
                            <th className="px-4 py-4 cursor-pointer hover:text-slate-900 transition-colors" onClick={() => handleSort("isTrackingActive")}>
                              <div className="flex items-center gap-1">
                                <span>Status</span>
                                <span className="text-[10px] opacity-75">{sortBy === "isTrackingActive" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}</span>
                              </div>
                            </th>
                            <th className="px-3 py-4 cursor-pointer hover:text-slate-900 transition-colors" onClick={() => handleSort("sessionTimeTodayMs")}>
                              <div className="flex items-center gap-1">
                                <span>Session Time</span>
                                <span className="text-[10px] opacity-75">{sortBy === "sessionTimeTodayMs" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}</span>
                              </div>
                            </th>
                            <th className="px-3 py-4 cursor-pointer hover:text-slate-900 transition-colors" onClick={() => handleSort("activeTimeTodayMs")}>
                              <div className="flex items-center gap-1">
                                <span>Active Time</span>
                                <span className="text-[10px] opacity-75">{sortBy === "activeTimeTodayMs" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}</span>
                              </div>
                            </th>
                            <th className="px-3 py-4 cursor-pointer hover:text-slate-900 transition-colors" onClick={() => handleSort("focusRatioToday")}>
                              <div className="flex items-center gap-1">
                                <span>Focus Ratio</span>
                                <span className="text-[10px] opacity-75">{sortBy === "focusRatioToday" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}</span>
                              </div>
                            </th>
                            <th className="px-3 py-4 cursor-pointer hover:text-slate-900 transition-colors text-center" onClick={() => handleSort("tasksStartedToday")}>
                              <div className="flex items-center justify-center gap-1">
                                <span>Started</span>
                                <span className="text-[10px] opacity-75">{sortBy === "tasksStartedToday" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}</span>
                              </div>
                            </th>
                            <th className="px-3 py-4 cursor-pointer hover:text-slate-900 transition-colors text-center" onClick={() => handleSort("tasksSkippedToday")}>
                              <div className="flex items-center justify-center gap-1">
                                <span>Skipped</span>
                                <span className="text-[10px] opacity-75">{sortBy === "tasksSkippedToday" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}</span>
                              </div>
                            </th>
                            <th className="px-3 py-4 cursor-pointer hover:text-slate-900 transition-colors text-center" onClick={() => handleSort("pauseCountToday")}>
                              <div className="flex items-center justify-center gap-1">
                                <span>Pauses</span>
                                <span className="text-[10px] opacity-75">{sortBy === "pauseCountToday" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}</span>
                              </div>
                            </th>
                            <th className="px-4 py-4 cursor-pointer hover:text-slate-900 transition-colors" onClick={() => handleSort("eventCount")}>
                              <div className="flex items-center gap-1">
                                <span>Total Events</span>
                                <span className="text-[10px] opacity-75">{sortBy === "eventCount" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}</span>
                              </div>
                            </th>

                            <th className="px-4 py-4 cursor-pointer hover:text-slate-900 transition-colors" onClick={() => handleSort("lastActive")}>
                              <div className="flex items-center gap-1">
                                <span>Last Active</span>
                                <span className="text-[10px] opacity-75">{sortBy === "lastActive" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}</span>
                              </div>
                            </th>
                            <th className="px-4 py-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAndSortedMembers.length === 0 ? (
                            <tr>
                              <td colSpan={11} className="p-8 text-center text-slate-500 text-xs">
                                No employees match the selected filters.
                              </td>
                            </tr>
                          ) : (
                            filteredAndSortedMembers.map(member => (
                              <tr key={member.email} className="border-b border-slate-200/70 hover:bg-slate-50/40 transition-colors">
                                <td className="px-4 py-3.5">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-600 text-xs shrink-0">
                                      {member.name.substring(0,2).toUpperCase()}
                                    </div>
                                    <div>
                                      <p className="text-xs font-bold text-slate-800">{member.name}</p>
                                      <p className="text-[10px] text-slate-500 truncate w-32">{member.email}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3.5">
                                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-semibold border ${
                                    member.isTrackingActive
                                      ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                                      : "bg-slate-50 border-slate-200 text-slate-500"
                                  }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${member.isTrackingActive ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                                    <span>{member.isTrackingActive ? "Active" : "Offline"}</span>
                                  </span>
                                </td>
                                <td className="px-3 py-3.5 text-slate-700">
                                  {formatDurationMs(member.sessionTimeTodayMs || 0)}
                                </td>
                                <td className="px-3 py-3.5 text-emerald-600 font-medium">
                                  {formatDurationMs(member.activeTimeTodayMs || 0)}
                                </td>
                                <td className="px-3 py-3.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className={
                                      (member.focusRatioToday || 0) >= 80 ? "text-purple-600 font-semibold" :
                                      (member.focusRatioToday || 0) >= 50 ? "text-amber-600" : "text-red-650 text-red-600"
                                    }>
                                      {member.focusRatioToday || 0}%
                                    </span>
                                    {member.sessionTimeTodayMs ? (
                                      <div className="w-10 bg-slate-100 border border-slate-200/60 h-1 rounded-full overflow-hidden shrink-0 hidden sm:block">
                                        <div 
                                          style={{ width: `${member.focusRatioToday || 0}%` }}
                                          className={`h-full rounded-full ${
                                            (member.focusRatioToday || 0) >= 80 ? "bg-purple-500" :
                                            (member.focusRatioToday || 0) >= 50 ? "bg-amber-500" : "bg-red-500"
                                          }`}
                                        />
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="px-3 py-3.5 text-slate-700 font-bold text-center">
                                  {member.tasksStartedToday || 0}
                                </td>
                                <td className="px-3 py-3.5 text-slate-700 font-bold text-center">
                                  {member.tasksSkippedToday || 0}
                                </td>
                                <td className="px-3 py-3.5 text-slate-700 text-center">
                                  {member.pauseCountToday || 0}
                                </td>
                                <td className="px-4 py-3.5 text-slate-700">
                                  {member.eventCount.toLocaleString()}
                                </td>

                                <td className="px-4 py-3.5 text-slate-500">
                                  {member.lastActive ? `${formatDate(member.lastActive)} ${formatTime(member.lastActive)}` : "--:--"}
                                </td>
                                <td className="px-4 py-3.5 text-right">
                                  <button
                                    onClick={() => {
                                      setSelectedUser(member.email)
                                      setActiveTab("timeline")
                                    }}
                                    className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-100 hover:border-blue-200 rounded-lg transition-all text-[10px] font-semibold flex items-center gap-1 inline-flex cursor-pointer"
                                  >
                                    <span>Audit</span>
                                    <ArrowRight className="w-2.5 h-2.5" />
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* SVG Charts Area */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Hourly Load (SVG Custom Bar Chart) */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-slate-100/50">
                      <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-6">Interaction Load by Hour</h4>
                      {hourlyActivity.length === 0 ? (
                        <div className="h-64 flex items-center justify-center text-slate-500 text-xs border border-slate-200 border-dashed rounded-xl">
                          No hourly telemetry logs available.
                        </div>
                      ) : (
                        <div className="h-64 flex flex-col justify-between">
                          {/* Rendering custom SVG bars */}
                          <svg className="w-full h-48 overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                            {(() => {
                              const maxVal = Math.max(...hourlyActivity.map(h => h.count), 1)
                              return hourlyActivity.map((h, i) => {
                                const barHeight = (h.count / maxVal) * 80
                                const x = (i / hourlyActivity.length) * 100 + (100 / hourlyActivity.length) * 0.1
                                const width = (100 / hourlyActivity.length) * 0.8
                                const y = 90 - barHeight
                                return (
                                  <g key={h.hour} className="group cursor-pointer">
                                    <rect
                                      x={`${x}%`}
                                      y={`${y}%`}
                                      width={`${width}%`}
                                      height={`${barHeight}%`}
                                      className="fill-blue-400/20 hover:fill-blue-500/80 border border-blue-500/20 hover:border-blue-500/50 transition-all duration-200"
                                      rx="1"
                                    />
                                    <title>{`Hour ${h.hour}:00 - ${h.count} events`}</title>
                                  </g>
                                )
                              })
                            })()}
                            {/* Base line */}
                            <line x1="0" y1="90%" x2="100%" y2="90%" stroke="rgba(0,0,0,0.06)" strokeWidth="1" />
                          </svg>
                          {/* Hour labels */}
                          <div className="flex justify-between px-1 text-[9px] text-slate-500 border-t border-slate-200 pt-3">
                            {hourlyActivity.filter((_, idx) => idx % Math.max(1, Math.floor(hourlyActivity.length / 6)) === 0).map(h => (
                              <span key={h.hour}>{h.hour}:00</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Event Type distribution */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-slate-100/50">
                      <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-6">Log Categories Breakdown</h4>
                      {eventDistribution.length === 0 ? (
                        <div className="h-64 flex items-center justify-center text-slate-500 text-xs border border-slate-200 border-dashed rounded-xl">
                          No categorizable activity distribution.
                        </div>
                      ) : (
                        <div className="space-y-4 h-64 overflow-y-auto pr-1">
                          {(() => {
                            const total = eventDistribution.reduce((acc, curr) => acc + curr.count, 0)
                            return eventDistribution.map(dist => {
                              const percentage = ((dist.count / total) * 100).toFixed(1)
                              return (
                                <div key={dist.event_type} className="space-y-1">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                                      {getEventIcon(dist.event_type)}
                                      <span>{dist.event_type}</span>
                                    </span>
                                    <span className="text-slate-500">{dist.count.toLocaleString()} ({percentage}%)</span>
                                  </div>
                                  <div className="w-full bg-slate-100 border border-slate-200/60 h-2 rounded-full overflow-hidden">
                                    <div
                                      style={{ width: `${percentage}%` }}
                                      className="bg-blue-600 h-full rounded-full transition-all duration-500"
                                    />
                                  </div>
                                </div>
                              )
                            })
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ========================================================
              INDIVIDUAL PROFILE TAB
             ======================================================== */}
          {activeTab === "timeline" && (
            <div className="space-y-6 animate-fade-in">
              {/* Selected User Header */}
              {(() => {
                const selectedMember = teamMembers.find(m => m.email.toLowerCase() === selectedUser.toLowerCase())
                if (!selectedMember) return null
                return (
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-slate-100/50 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border-2 ${
                        selectedMember.currentStatus === "active" ? "border-emerald-250 text-emerald-600 bg-emerald-50 animate-pulse" :
                        selectedMember.currentStatus === "idle" ? "border-amber-250 text-amber-600 bg-amber-50" :
                        "border-slate-200 text-slate-500 bg-slate-100"
                      }`}>
                        {selectedMember.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-md font-bold text-slate-900 flex items-center gap-2">
                          <span>{selectedMember.name}</span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold border ${
                            selectedMember.currentStatus === "active" ? "bg-emerald-50 border-emerald-100 text-emerald-700" :
                            selectedMember.currentStatus === "idle" ? "bg-amber-50 border-amber-100 text-amber-700" :
                            "bg-slate-50 border-slate-200 text-slate-500"
                          }`}>
                            <span className={`w-1 h-1 rounded-full ${selectedMember.currentStatus === "active" ? "bg-emerald-500" : selectedMember.currentStatus === "idle" ? "bg-amber-500" : "bg-slate-400"}`} />
                            <span>{selectedMember.currentStatus.toUpperCase()}</span>
                          </span>
                        </h3>
                        <p className="text-[11px] text-slate-550 text-slate-500 mt-0.5">{selectedMember.email}</p>
                        <p className="text-[9px] text-slate-500 uppercase tracking-wider mt-1">Role: {selectedMember.role}</p>
                      </div>
                    </div>
                    
                    {selectedMember.lastActive && (
                      <div className="text-right text-xs text-slate-500 space-y-1">
                        <p>Last Sync: <span className="text-slate-700 font-semibold">{formatDate(selectedMember.lastActive)} {formatTime(selectedMember.lastActive)}</span></p>
                        {selectedMember.lastUrl && (
                          <p className="truncate max-w-xs text-[10px] text-blue-600" title={selectedMember.lastUrl}>
                            Active URL: <a href={selectedMember.lastUrl} target="_blank" rel="noreferrer" className="hover:underline">{selectedMember.lastUrl}</a>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Visual Horizontal Timeline Bar */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-slate-100/50 space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Visual Day Timeline</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">Chronological active session blocks, paused breaks, and idle states today</p>
                </div>
                {(() => {
                  if (profileTimelineEvents.length === 0) {
                    return (
                      <div className="h-10 bg-slate-50 border border-slate-200 border-dashed rounded-xl flex items-center justify-center text-xs text-slate-500 italic">
                        No tracking milestones recorded yet today for this user.
                      </div>
                    )
                  }

                  const selectedMember = teamMembers.find(m => m.email.toLowerCase() === selectedUser.toLowerCase())
                  const sortedEvts = [...profileTimelineEvents].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
                  const firstTime = new Date(sortedEvts[0].timestamp).getTime()
                  const isUserActive = selectedMember?.currentStatus === "active" || selectedMember?.currentStatus === "idle"
                  const lastTime = isUserActive ? Date.now() : new Date(sortedEvts[sortedEvts.length - 1].timestamp).getTime()
                  const totalDuration = Math.max(1, lastTime - firstTime)

                  const blocks: Array<{ type: "active" | "paused" | "idle"; widthPercent: number; title: string }> = []
                  let currentStart = firstTime
                  let currentType: "active" | "paused" | "idle" = "active"

                  sortedEvts.forEach(evt => {
                    const evtTime = new Date(evt.timestamp).getTime()
                    const elapsed = Math.max(0, evtTime - currentStart)
                    const widthPercent = (elapsed / totalDuration) * 100

                    if (widthPercent > 0.3) {
                      blocks.push({
                        type: currentType,
                        widthPercent,
                        title: `${currentType.toUpperCase()}: ${formatDurationMs(elapsed)}`
                      })
                    }

                    currentStart = evtTime
                    if (evt.event_type === "SESSION_PAUSED") {
                      currentType = "paused"
                    } else if (evt.event_type === "SESSION_RESUMED" || evt.event_type === "SESSION_STARTED") {
                      currentType = "active"
                    } else if (evt.event_type === "IDLE_STATE_CHANGED" && evt.metadata?.state === "idle") {
                      currentType = "idle"
                    } else if (evt.event_type === "IDLE_STATE_CHANGED" && evt.metadata?.state === "active") {
                      currentType = "active"
                    }
                  })

                  const finalElapsed = Math.max(0, lastTime - currentStart)
                  const finalWidth = (finalElapsed / totalDuration) * 100
                  if (finalWidth > 0.3) {
                    blocks.push({
                      type: currentType,
                      widthPercent: finalWidth,
                      title: `${currentType.toUpperCase()}: ${formatDurationMs(finalElapsed)}`
                    })
                  }

                  return (
                    <div className="space-y-3">
                      <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                        <span>Started: {new Date(firstTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        <span>Span: {formatDurationMs(totalDuration)}</span>
                        <span>Latest: {new Date(lastTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <div className="w-full h-5 bg-slate-100 border border-slate-200/85 rounded-full overflow-hidden flex select-none shadow-inner">
                        {blocks.map((block, idx) => (
                          <div 
                            key={idx}
                            style={{ width: `${block.widthPercent}%` }}
                            className={`h-full border-r border-slate-900/10 last:border-0 hover:brightness-105 transition-all cursor-help ${
                              block.type === "active" ? "bg-emerald-500" :
                              block.type === "paused" ? "bg-amber-500" : "bg-slate-500 animate-pulse-slow"
                            }`}
                            title={block.title}
                          />
                        ))}
                      </div>
                      <div className="flex gap-4 text-[10px] justify-center pt-1 border-t border-slate-200/50">
                        <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
                          <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
                          <span>Active / Work time</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-amber-600 font-medium">
                          <span className="w-2.5 h-2.5 bg-amber-500 rounded-full" />
                          <span>Paused breaks</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-slate-500">
                          <span className="w-2.5 h-2.5 bg-slate-600 rounded-full" />
                          <span>Idle / Away</span>
                        </span>
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* Two Column Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left Column: Analytics summaries */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Metric Cards Grid */}
                  {(() => {
                    const selectedMember = teamMembers.find(m => m.email.toLowerCase() === selectedUser.toLowerCase())
                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm shadow-slate-100/50">
                          <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block mb-1">Active Time</span>
                          <h4 className="text-lg font-bold text-emerald-600">{formatDurationMs(selectedMember?.activeTimeTodayMs || 0)}</h4>
                          <span className="text-[9px] text-slate-500">Working hours today</span>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm shadow-slate-100/50">
                          <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block mb-1">Focus Ratio</span>
                          <h4 className="text-lg font-bold text-purple-600">{selectedMember?.focusRatioToday || 0}%</h4>
                          <span className="text-[9px] text-slate-500">Work percentage today</span>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm shadow-slate-100/50">
                          <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block mb-1">Started Today</span>
                          <h4 className="text-lg font-bold text-slate-800">{selectedMember?.tasksStartedToday || 0} tasks</h4>
                          <span className="text-[9px] text-slate-500">Started tasks today</span>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm shadow-slate-100/50">
                          <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block mb-1">Pause Breaks</span>
                          <h4 className="text-lg font-bold text-amber-600">{selectedMember?.pauseCountToday || 0} times</h4>
                          <span className="text-[9px] text-slate-500">Pause states today</span>
                        </div>
                      </div>
                    )
                  })()}


                  {/* Task Lifecycle Log Table */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-slate-100/50 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Task Progress History</h4>
                      <span className="text-[9px] text-slate-500 font-mono">Showing last 50 tasks</span>
                    </div>

                    <div className="overflow-x-auto max-h-[20rem]">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                            <th className="py-2.5 px-3">Outcome</th>
                            <th className="py-2.5 px-3">Project ID</th>
                            <th className="py-2.5 px-3">Data ID</th>
                            <th className="py-2.5 px-3">Timestamp</th>
                            <th className="py-2.5 px-3 text-right">Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profileTaskEvents.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-6 text-center text-slate-500 italic">
                                No task events recorded for this user.
                              </td>
                            </tr>
                          ) : (
                            profileTaskEvents.map(evt => (
                              <tr key={evt.id} className="border-b border-slate-200/60 last:border-0 hover:bg-slate-50/40">
                                <td className="py-2.5 px-3">
                                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-semibold border ${
                                    evt.event_type === "TASK_SKIPPED" ? "bg-amber-50 border-amber-100 text-amber-700" :
                                    evt.event_type === "TASK_STARTED" ? "bg-blue-50 border-blue-100 text-blue-700" :
                                    "bg-red-50 border-red-100 text-red-700"
                                  }`}>
                                    <span>{evt.event_type === "TASK_SKIPPED" ? "Skipped" : evt.event_type === "TASK_STARTED" ? "Started" : "Left"}</span>
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-slate-700 font-mono select-all truncate max-w-[80px]" title={evt.project_id}>
                                  {evt.project_id || "N/A"}
                                </td>
                                <td className="py-2.5 px-3 text-slate-700 font-mono select-all truncate max-w-[80px]" title={evt.data_id}>
                                  {evt.data_id || "N/A"}
                                </td>
                                <td className="py-2.5 px-3 text-slate-500">
                                  {formatDate(evt.timestamp)} {formatTime(evt.timestamp)}
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  {evt.metadata && Object.keys(evt.metadata).length > 0 && (
                                    <span className="text-[9px] text-slate-500 font-light truncate max-w-[120px] inline-block" title={JSON.stringify(evt.metadata)}>
                                      {evt.metadata.reason || evt.metadata.dataTestId || "Captured"}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Right Column: Site/Section times & Granular feed */}
                <div className="lg:col-span-1 space-y-6">
                  {/* Website active times */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-slate-100/50 space-y-4">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Active Domain Distribution</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">Top websites visited today</p>
                    </div>

                    <div className="space-y-3.5 max-h-48 overflow-y-auto pr-1">
                      {Object.keys(profileDomainTime).length === 0 ? (
                        <p className="text-xs text-slate-500 italic text-center py-4">No domain logs recorded today.</p>
                      ) : (
                        (() => {
                          const totalMs = Object.values(profileDomainTime).reduce((a, b) => a + b, 0)
                          return Object.entries(profileDomainTime)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 5)
                            .map(([domain, duration]) => {
                              const percent = totalMs > 0 ? ((duration / totalMs) * 100).toFixed(0) : "0"
                              return (
                                <div key={domain} className="space-y-1">
                                  <div className="flex items-center justify-between text-[10px]">
                                    <span className="font-semibold text-slate-700 truncate max-w-[120px]" title={domain}>{domain}</span>
                                    <span className="text-slate-500 font-medium">{formatDurationMs(duration)} ({percent}%)</span>
                                  </div>
                                  <div className="w-full bg-slate-100 border border-slate-200/60 h-1.5 rounded-full overflow-hidden">
                                    <div 
                                      style={{ width: `${percent}%` }}
                                      className="bg-blue-600 h-full rounded-full"
                                    />
                                  </div>
                                </div>
                              )
                            })
                        })()
                      )}
                    </div>
                  </div>

                  {/* Encord Page section breakdown */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-slate-100/50 space-y-4">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Encord Pages Breakdown</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">Total duration per section today</p>
                    </div>

                    <div className="space-y-3.5">
                      {(() => {
                        const totalMs = Object.values(profileEncordCategoryTime).reduce((a, b) => a + b, 0)
                        return Object.entries(profileEncordCategoryTime).map(([category, duration]) => {
                          const percent = totalMs > 0 ? ((duration / totalMs) * 100).toFixed(0) : "0"
                          const title = category === "label_editor" ? "Label Editor" :
                                        category === "project_view" ? "Project View" :
                                        category === "projects" ? "Projects Dashboard" :
                                        category === "home" ? "Home Feed" : "Other Pages"
                          return (
                            <div key={category} className="space-y-1">
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="font-semibold text-slate-700">{title}</span>
                                <span className="text-slate-500 font-medium">{formatDurationMs(duration)} ({percent}%)</span>
                              </div>
                              <div className="w-full bg-slate-100 border border-slate-200/60 h-1.5 rounded-full overflow-hidden">
                                <div 
                                  style={{ width: `${percent}%` }}
                                  className="bg-purple-500 h-full rounded-full"
                                />
                              </div>
                            </div>
                          )
                        })
                      })()}
                    </div>
                  </div>

                  {/* Granular activity timeline logs dropdown list */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-slate-100/50 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Granular Chronology Feed</h4>
                      <span className="text-[9px] bg-slate-50 border border-slate-200/60 text-slate-500 px-1.5 py-0.5 rounded">Last 300</span>
                    </div>

                    <div className="max-h-[30rem] overflow-y-auto space-y-3.5 pr-1 text-xs">
                      {timelineLogs.length === 0 ? (
                        <p className="text-center text-slate-500 italic py-6">No telemetry logs found.</p>
                      ) : (
                        timelineLogs.map(log => (
                          <div key={log.id} className="border-l border-blue-200/60 pl-3 py-1 space-y-1 relative group">
                            <div className="absolute -left-[5.5px] top-1.5 w-2.5 h-2.5 bg-white border border-blue-400 rounded-full" />
                            <div className="flex justify-between items-center text-[10px]">
                              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                                {getEventIcon(log.event_type)}
                                <span>{log.event_type}</span>
                              </span>
                              <span className="text-slate-500 font-mono">{formatTime(log.timestamp)}</span>
                            </div>
                            {log.title && <p className="text-slate-600 font-medium truncate" title={log.title}>{log.title}</p>}
                            {log.url && <p className="text-[10px] text-blue-600 truncate hover:underline" title={log.url}><a href={log.url} target="_blank" rel="noreferrer">{log.url}</a></p>}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
