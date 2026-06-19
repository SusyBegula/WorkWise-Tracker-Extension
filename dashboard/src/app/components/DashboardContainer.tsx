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
  tasksCompletedToday?: number
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
  tasksCompletedToday: number
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
  const [activeTab, setActiveTab] = useState<"dashboard" | "team" | "timeline" | "screenshots">("dashboard")
  const [selectedUser, setSelectedUser] = useState<string>("")
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [eventDistribution, setEventDistribution] = useState<EventDist[]>([])
  const [hourlyActivity, setHourlyActivity] = useState<HourlyAct[]>([])
  const [timelineLogs, setTimelineLogs] = useState<ActivityLog[]>([])
  const [timelineStats, setTimelineStats] = useState<EventDist[]>([])
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  
  // Home Dashboard Specific States
  const [kpis, setKpis] = useState<KPIStats | null>(null)
  const [sparkline, setSparkline] = useState<SparklineData | null>(null)
  const [alerts, setAlerts] = useState<AlertItem[]>([])

  // Individual Profile States
  const [profileTaskEvents, setProfileTaskEvents] = useState<any[]>([])
  const [profileScreenshots, setProfileScreenshots] = useState<any[]>([])
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
  const [isLoadingScreenshots, setIsLoadingScreenshots] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  
  // Lightbox State for Screenshots
  const [lightboxImg, setLightboxImg] = useState<{ src: string; title: string; email: string; time: string } | null>(null)

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

  // Load Timeline or Screenshot Data when user selection / tab changes
  useEffect(() => {
    if (activeTab === "timeline" && selectedUser) {
      fetchTimelineData(selectedUser)
    } else if (activeTab === "screenshots") {
      fetchScreenshotsData(selectedUser)
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
      setProfileScreenshots(data.screenshots || [])
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


  const fetchScreenshotsData = async (email?: string) => {
    setIsLoadingScreenshots(true)
    try {
      const url = email ? `/api/telemetry/screenshots?email=${encodeURIComponent(email)}` : "/api/telemetry/screenshots"
      const res = await fetch(url)
      if (!res.ok) throw new Error("Failed to load screenshots feed.")
      const data = await res.json()
      setScreenshots(data || [])
    } catch (err: any) {
      console.error(err)
    } finally {
      setIsLoadingScreenshots(false)
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
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.04),transparent_50%)] pointer-events-none" />

      {/* Sidebar */}
      <aside className="w-64 bg-[#111827]/40 border-r border-white/5 flex flex-col backdrop-blur-md">
        {/* Brand Header */}
        <div className="p-6 border-b border-white/5 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-center justify-center text-blue-400">
            <Clock className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h1 className="text-md font-bold tracking-tight text-white flex items-center gap-1.5">
              WorkWise <span className="text-[9px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-full border border-blue-500/30">Console</span>
            </h1>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
              activeTab === "dashboard"
                ? "bg-blue-600/15 border border-blue-500/20 text-blue-400 font-semibold"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            <Home className="w-4 h-4" />
            <span>Overview (Home)</span>
          </button>

          <button
            onClick={() => setActiveTab("team")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
              activeTab === "team"
                ? "bg-blue-600/15 border border-blue-500/20 text-blue-400 font-semibold"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Team Overview</span>
          </button>

          <button
            onClick={() => setActiveTab("timeline")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
              activeTab === "timeline"
                ? "bg-blue-600/15 border border-blue-500/20 text-blue-400 font-semibold"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Employee Timelines</span>
          </button>

          <button
            onClick={() => setActiveTab("screenshots")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
              activeTab === "screenshots"
                ? "bg-blue-600/15 border border-blue-500/20 text-blue-400 font-semibold"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>Visual Screenshots</span>
          </button>
        </nav>

        {/* Profile Footer */}
        <div className="p-4 border-t border-white/5 space-y-4">
          <div className="bg-slate-900/50 border border-white/5 rounded-xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-800 border border-white/10 rounded-full flex items-center justify-center font-bold text-blue-400 text-sm">
              {session.name ? session.name.substring(0, 2).toUpperCase() : "AD"}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-slate-200 truncate">{session.name || "Administrator"}</p>
              <p className="text-[10px] text-slate-500 truncate" title={session.email}>{session.email}</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border border-white/5 hover:border-red-500/20 hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Log Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-y-auto">
        {/* Top bar header */}
        <header className="h-16 border-b border-white/5 px-8 flex items-center justify-between shrink-0 bg-[#090d16]/30 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-white uppercase tracking-widest">
              {activeTab === "dashboard" && "🏠 Operations Command Center"}
              {activeTab === "team" && "👥 Team Performance Roster"}
              {activeTab === "timeline" && "⌛ Employee Timeline Detailed Logs"}
              {activeTab === "screenshots" && "📸 Visual Proof-Of-Work Feed"}
            </h2>
          </div>
          {/* User selection sync bar for subtabs */}
          {(activeTab === "timeline" || activeTab === "screenshots") && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Focus User:</span>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="bg-slate-900/80 border border-white/10 text-slate-200 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-blue-500/30 cursor-pointer animate-fade-in"
              >
                {teamMembers.map(member => (
                  <option key={member.email} value={member.email}>
                    {member.name || member.email}
                  </option>
                ))}
              </select>
              <button 
                onClick={() => {
                  if (activeTab === "timeline") fetchTimelineData(selectedUser)
                  else fetchScreenshotsData(selectedUser)
                }}
                className="p-1.5 bg-slate-900 border border-white/5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Refresh logs"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {(activeTab === "dashboard" || activeTab === "team") && (
            <button 
              onClick={fetchOverviewData}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-white/5 hover:bg-white/5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Refresh Data</span>
            </button>
          )}
        </header>

        {/* Dashboard Panels */}
        <div className="flex-1 p-8 space-y-6">
          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-4 flex items-start gap-3 text-red-400 text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Unable to fetch dashboard telemetry</p>
                <p className="text-xs text-red-400/80 mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* ========================================================
              OVERVIEW TAB
             ==================================================          {/* ========================================================
              DASHBOARD (HOME / LANDING)
             ======================================================== */}
          {activeTab === "dashboard" && (
            <>
              {isLoadingOverview ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                  <RotateCw className="w-8 h-8 animate-spin text-blue-500" />
                  <span className="text-sm">Initializing command center...</span>
                </div>
              ) : (
                <div className="space-y-8 animate-fade-in">
                  {/* Real-time Team Activity Strip */}
                  <div className="bg-[#111827]/40 border border-white/5 rounded-2xl p-6 backdrop-blur-md">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Live Activity Feed</h4>
                        <p className="text-[10px] text-slate-500">Real-time status updates from active extension clients</p>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="flex items-center gap-1.5 text-emerald-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-ping" />
                          {teamMembers.filter(m => m.currentStatus === "active").length} Active
                        </span>
                        <span className="flex items-center gap-1.5 text-amber-400">
                          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                          {teamMembers.filter(m => m.currentStatus === "idle").length} Idle
                        </span>
                        <span className="flex items-center gap-1.5 text-slate-500">
                          <span className="w-2 h-2 rounded-full bg-slate-600 inline-block" />
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
                          className="bg-[#090d16]/50 border border-white/5 hover:border-blue-500/20 hover:bg-blue-600/[0.02] rounded-xl p-3 flex items-center gap-3 transition-all cursor-pointer group"
                        >
                          {/* Avatar status ring */}
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 border-2 ${
                            member.currentStatus === "active" ? "border-emerald-500 text-emerald-400 bg-emerald-500/5" :
                            member.currentStatus === "idle" ? "border-amber-500 text-amber-400 bg-amber-500/5" :
                            "border-slate-800 text-slate-400 bg-slate-900/50"
                          }`}>
                            {member.name.substring(0, 2).toUpperCase()}
                          </div>

                          <div className="overflow-hidden flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-xs font-bold text-slate-200 truncate group-hover:text-blue-400 transition-colors">{member.name}</p>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                member.currentStatus === "active" ? "bg-emerald-400" :
                                member.currentStatus === "idle" ? "bg-amber-400" : "bg-slate-600"
                              }`} />
                            </div>
                            <p className="text-[9px] text-slate-500 truncate" title={member.email}>{member.email}</p>
                            <p className="text-[9px] text-slate-400 truncate mt-1 italic font-light">
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
                    <div className="bg-[#111827]/40 border border-white/5 rounded-2xl p-6 relative overflow-hidden backdrop-blur-md">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Active Today</span>
                        <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-400">
                          <Users className="w-4 h-4" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-white">
                        {kpis?.totalAnnotatorsToday || 0} <span className="text-xs font-normal text-slate-500">/ {teamMembers.length}</span>
                      </h3>
                      <p className="text-slate-500 text-[10px] mt-1.5">Logged session load today</p>
                    </div>

                    {/* Team Production Time Today */}
                    <div className="bg-[#111827]/40 border border-white/5 rounded-2xl p-6 relative overflow-hidden backdrop-blur-md">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Team Active Time</span>
                        <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-400">
                          <Clock className="w-4 h-4" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-white">
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

                    {/* Tasks Completed Today */}
                    <div className="bg-[#111827]/40 border border-white/5 rounded-2xl p-6 relative overflow-hidden backdrop-blur-md">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Tasks Done Today</span>
                        <div className="w-8 h-8 bg-cyan-500/10 rounded-lg flex items-center justify-center text-cyan-400">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-white">
                        {kpis?.tasksCompletedToday || 0}
                      </h3>
                      <p className="text-slate-500 text-[10px] mt-1.5">Completed milestone tasks</p>
                    </div>

                    {/* Skip Rate Today */}
                    <div className="bg-[#111827]/40 border border-white/5 rounded-2xl p-6 relative overflow-hidden backdrop-blur-md">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Task Skip Rate</span>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          (kpis?.skipRateToday || 0) >= 40 ? "bg-red-500/10 text-red-400" : "bg-yellow-500/10 text-yellow-400"
                        }`}>
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                      </div>
                      <h3 className={`text-2xl font-bold ${
                        (kpis?.skipRateToday || 0) >= 40 ? "text-red-400" : "text-white"
                      }`}>
                        {kpis?.skipRateToday || 0}%
                      </h3>
                      <p className="text-slate-500 text-[10px] mt-1.5">Ratio of skipped vs done tasks</p>
                    </div>

                    {/* Average Focus Ratio */}
                    <div className="bg-[#111827]/40 border border-white/5 rounded-2xl p-6 relative overflow-hidden backdrop-blur-md">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Avg Focus Ratio</span>
                        <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center text-purple-400">
                          <TrendingUp className="w-4 h-4" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-white">
                        {kpis?.focusRatioToday || 0}%
                      </h3>
                      <div className="w-full bg-slate-900 border border-white/5 h-1.5 rounded-full overflow-hidden mt-1.5">
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
                    <div className="lg:col-span-2 bg-[#111827]/40 border border-white/5 rounded-2xl p-6 backdrop-blur-md">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Weekly Task Completion</h4>
                          <span className="text-[10px] text-slate-500">Tasks completed over the last 7 days</span>
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
                                      <span className="absolute -top-7 scale-0 group-hover:scale-100 bg-slate-950 border border-white/10 px-2 py-0.5 rounded text-[10px] font-bold transition-all z-10">
                                        {val} tasks
                                      </span>
                                    </div>
                                    <div 
                                      style={{ height: `${heightPercent}%` }}
                                      className="w-full max-w-[40px] bg-gradient-to-t from-blue-600/30 to-blue-500/80 hover:to-blue-400 border border-blue-500/30 hover:border-blue-400/50 rounded-lg transition-all duration-300 cursor-pointer"
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
                        <div className="h-44 flex items-center justify-center text-slate-500 text-xs border border-white/[0.02] border-dashed rounded-xl">
                          No historical task data found.
                        </div>
                      )}
                    </div>

                    {/* Operational Alerts feed */}
                    <div className="lg:col-span-1 bg-[#111827]/40 border border-white/5 rounded-2xl p-6 backdrop-blur-md flex flex-col">
                      <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
                        <div className="flex items-center gap-2">
                          <Bell className="w-4 h-4 text-amber-500 animate-bounce" />
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Alert Center</h4>
                        </div>
                        <span className="text-[9px] bg-white/5 px-2 py-0.5 rounded-full text-slate-400 font-semibold">
                          {alerts.length} Today
                        </span>
                      </div>

                      <div className="flex-1 overflow-y-auto max-h-[15rem] space-y-3 pr-1">
                        {alerts.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs py-10">
                            <Check className="w-8 h-8 text-emerald-500/30 mb-2 border border-emerald-500/10 rounded-full p-1.5" />
                            <span>Operations optimal. No active alerts.</span>
                          </div>
                        ) : (
                          alerts.map(alert => (
                            <div 
                              key={alert.id}
                              className={`border rounded-xl p-3 flex gap-2.5 text-xs transition-all ${
                                alert.type === "critical" ? "bg-red-500/5 border-red-500/20 text-red-400" :
                                alert.type === "warning" ? "bg-amber-500/5 border-amber-500/20 text-amber-400" :
                                "bg-blue-500/5 border-blue-500/20 text-blue-400"
                              }`}
                            >
                              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 animate-pulse" />
                              <div className="space-y-0.5">
                                <p className="font-bold text-white">{alert.title}</p>
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
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                  <RotateCw className="w-8 h-8 animate-spin text-blue-500" />
                  <span className="text-sm">Loading summary metrics...</span>
                </div>
              ) : (
                <div className="space-y-6 animate-fade-in">
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-[#111827]/40 border border-white/5 rounded-2xl p-6 relative overflow-hidden backdrop-blur-md">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Active Team</span>
                        <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-400">
                          <Users className="w-4 h-4" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-white">{activeMembers} / {teamMembers.length}</h3>
                      <p className="text-slate-500 text-[10px] mt-1.5 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-ping" />
                        <span>Currently active tracking sessions</span>
                      </p>
                    </div>

                    <div className="bg-[#111827]/40 border border-white/5 rounded-2xl p-6 relative overflow-hidden backdrop-blur-md">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Total Events logs</span>
                        <div className="w-8 h-8 bg-cyan-500/10 rounded-lg flex items-center justify-center text-cyan-400">
                          <Activity className="w-4 h-4" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-white">{totalLogsCount.toLocaleString()}</h3>
                      <p className="text-slate-500 text-[10px] mt-1.5">Accumulated clicks and keyboard inputs</p>
                    </div>

                    <div className="bg-[#111827]/40 border border-white/5 rounded-2xl p-6 relative overflow-hidden backdrop-blur-md">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Saved Screenshots</span>
                        <div className="w-8 h-8 bg-pink-500/10 rounded-lg flex items-center justify-center text-pink-400">
                          <ImageIcon className="w-4 h-4" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-white">{totalScreenshotsCount}</h3>
                      <p className="text-slate-500 text-[10px] mt-1.5">Visual verification recordings saved on disk</p>
                    </div>

                    <div className="bg-[#111827]/40 border border-white/5 rounded-2xl p-6 relative overflow-hidden backdrop-blur-md">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Telemetry Location</span>
                        <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center text-purple-400">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                      </div>
                      <h3 className="text-base font-bold text-white truncate">shared-telemetry.db</h3>
                      <p className="text-slate-500 text-[10px] mt-1.5 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        <span>SQLite database local cache isolation</span>
                      </p>
                    </div>
                  </div>

                  {/* Team Members List */}
                  <div className="bg-[#111827]/40 border border-white/5 rounded-2xl overflow-hidden backdrop-blur-md">
                    <div className="px-6 py-4 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h4 className="text-sm font-bold text-white uppercase tracking-wider">Employee Logging Status</h4>
                        <span className="text-[10px] text-slate-500">Master whitelist synced from Neon PostgreSQL DB</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {/* Search Input */}
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="Search employee..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-[#090d16]/60 border border-white/5 focus:border-blue-500/50 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white placeholder-slate-500 outline-none w-48 transition-all"
                          />
                        </div>
                        {/* Status Select Filter */}
                        <select
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value as any)}
                          className="bg-[#090d16]/60 border border-white/5 focus:border-blue-500/50 rounded-xl px-3 py-1.5 text-xs text-slate-300 outline-none cursor-pointer transition-all"
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
                          <tr className="border-b border-white/5 text-slate-400 font-semibold uppercase tracking-wider select-none">
                            <th className="px-4 py-4 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("name")}>
                              <div className="flex items-center gap-1">
                                <span>Employee</span>
                                <span className="text-[10px] opacity-75">{sortBy === "name" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}</span>
                              </div>
                            </th>
                            <th className="px-4 py-4 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("isTrackingActive")}>
                              <div className="flex items-center gap-1">
                                <span>Status</span>
                                <span className="text-[10px] opacity-75">{sortBy === "isTrackingActive" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}</span>
                              </div>
                            </th>
                            <th className="px-3 py-4 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("sessionTimeTodayMs")}>
                              <div className="flex items-center gap-1">
                                <span>Session Time</span>
                                <span className="text-[10px] opacity-75">{sortBy === "sessionTimeTodayMs" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}</span>
                              </div>
                            </th>
                            <th className="px-3 py-4 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("activeTimeTodayMs")}>
                              <div className="flex items-center gap-1">
                                <span>Active Time</span>
                                <span className="text-[10px] opacity-75">{sortBy === "activeTimeTodayMs" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}</span>
                              </div>
                            </th>
                            <th className="px-3 py-4 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("focusRatioToday")}>
                              <div className="flex items-center gap-1">
                                <span>Focus Ratio</span>
                                <span className="text-[10px] opacity-75">{sortBy === "focusRatioToday" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}</span>
                              </div>
                            </th>
                            <th className="px-3 py-4 cursor-pointer hover:text-white transition-colors text-center" onClick={() => handleSort("tasksCompletedToday")}>
                              <div className="flex items-center justify-center gap-1">
                                <span>Done</span>
                                <span className="text-[10px] opacity-75">{sortBy === "tasksCompletedToday" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}</span>
                              </div>
                            </th>
                            <th className="px-3 py-4 cursor-pointer hover:text-white transition-colors text-center" onClick={() => handleSort("tasksSkippedToday")}>
                              <div className="flex items-center justify-center gap-1">
                                <span>Skipped</span>
                                <span className="text-[10px] opacity-75">{sortBy === "tasksSkippedToday" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}</span>
                              </div>
                            </th>
                            <th className="px-3 py-4 cursor-pointer hover:text-white transition-colors text-center" onClick={() => handleSort("pauseCountToday")}>
                              <div className="flex items-center justify-center gap-1">
                                <span>Pauses</span>
                                <span className="text-[10px] opacity-75">{sortBy === "pauseCountToday" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}</span>
                              </div>
                            </th>
                            <th className="px-4 py-4 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("eventCount")}>
                              <div className="flex items-center gap-1">
                                <span>Total Events</span>
                                <span className="text-[10px] opacity-75">{sortBy === "eventCount" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}</span>
                              </div>
                            </th>
                            <th className="px-4 py-4 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("screenshotCount")}>
                              <div className="flex items-center gap-1">
                                <span>Screens</span>
                                <span className="text-[10px] opacity-75">{sortBy === "screenshotCount" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}</span>
                              </div>
                            </th>
                            <th className="px-4 py-4 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("lastActive")}>
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
                              <td colSpan={12} className="p-8 text-center text-slate-500 text-xs">
                                No employees match the selected filters.
                              </td>
                            </tr>
                          ) : (
                            filteredAndSortedMembers.map(member => (
                              <tr key={member.email} className="border-b border-white/5 hover:bg-white/[0.01] transition-colors">
                                <td className="px-4 py-3.5">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center font-bold text-slate-300 text-xs shrink-0">
                                      {member.name.substring(0,2).toUpperCase()}
                                    </div>
                                    <div>
                                      <p className="text-xs font-bold text-slate-200">{member.name}</p>
                                      <p className="text-[10px] text-slate-500 truncate w-32">{member.email}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3.5">
                                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-semibold border ${
                                    member.isTrackingActive
                                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                      : "bg-slate-800/80 border-slate-700 text-slate-400"
                                  }`}>
                                    <span className={`w-1 h-1 rounded-full ${member.isTrackingActive ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
                                    <span>{member.isTrackingActive ? "Active" : "Offline"}</span>
                                  </span>
                                </td>
                                <td className="px-3 py-3.5 text-slate-300">
                                  {formatDurationMs(member.sessionTimeTodayMs || 0)}
                                </td>
                                <td className="px-3 py-3.5 text-emerald-400 font-medium">
                                  {formatDurationMs(member.activeTimeTodayMs || 0)}
                                </td>
                                <td className="px-3 py-3.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className={
                                      (member.focusRatioToday || 0) >= 80 ? "text-purple-400 font-semibold" :
                                      (member.focusRatioToday || 0) >= 50 ? "text-amber-400" : "text-red-400"
                                    }>
                                      {member.focusRatioToday || 0}%
                                    </span>
                                    {member.sessionTimeTodayMs ? (
                                      <div className="w-10 bg-slate-900 border border-white/5 h-1 rounded-full overflow-hidden shrink-0 hidden sm:block">
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
                                <td className="px-3 py-3.5 text-slate-300 font-bold text-center">
                                  {member.tasksCompletedToday || 0}
                                </td>
                                <td className="px-3 py-3.5 text-slate-300 font-bold text-center">
                                  {member.tasksSkippedToday || 0}
                                </td>
                                <td className="px-3 py-3.5 text-slate-300 text-center">
                                  {member.pauseCountToday || 0}
                                </td>
                                <td className="px-4 py-3.5 text-slate-300">
                                  {member.eventCount.toLocaleString()}
                                </td>
                                <td className="px-4 py-3.5 text-slate-300">
                                  {member.screenshotCount}
                                </td>
                                <td className="px-4 py-3.5 text-slate-400">
                                  {member.lastActive ? `${formatDate(member.lastActive)} ${formatTime(member.lastActive)}` : "--:--"}
                                </td>
                                <td className="px-4 py-3.5 text-right">
                                  <button
                                    onClick={() => {
                                      setSelectedUser(member.email)
                                      setActiveTab("timeline")
                                    }}
                                    className="p-1.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 hover:border-blue-500/40 rounded-lg transition-all text-[10px] font-semibold flex items-center gap-1 inline-flex cursor-pointer"
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
                    <div className="bg-[#111827]/40 border border-white/5 rounded-2xl p-6 backdrop-blur-md">
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-6">Interaction Load by Hour</h4>
                      {hourlyActivity.length === 0 ? (
                        <div className="h-64 flex items-center justify-center text-slate-500 text-xs border border-white/[0.02] border-dashed rounded-xl">
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
                                      className="fill-blue-500/35 hover:fill-blue-500/70 border border-blue-500/30 transition-all duration-200"
                                      rx="1"
                                    />
                                    <title>{`Hour ${h.hour}:00 - ${h.count} events`}</title>
                                  </g>
                                )
                              })
                            })()}
                            {/* Base line */}
                            <line x1="0" y1="90%" x2="100%" y2="90%" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                          </svg>
                          {/* Hour labels */}
                          <div className="flex justify-between px-1 text-[9px] text-slate-500 border-t border-white/5 pt-3">
                            {hourlyActivity.filter((_, idx) => idx % Math.max(1, Math.floor(hourlyActivity.length / 6)) === 0).map(h => (
                              <span key={h.hour}>{h.hour}:00</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Event Type distribution */}
                    <div className="bg-[#111827]/40 border border-white/5 rounded-2xl p-6 backdrop-blur-md">
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-6">Log Categories Breakdown</h4>
                      {eventDistribution.length === 0 ? (
                        <div className="h-64 flex items-center justify-center text-slate-500 text-xs border border-white/[0.02] border-dashed rounded-xl">
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
                                    <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                                      {getEventIcon(dist.event_type)}
                                      <span>{dist.event_type}</span>
                                    </span>
                                    <span className="text-slate-400">{dist.count.toLocaleString()} ({percentage}%)</span>
                                  </div>
                                  <div className="w-full bg-slate-900 border border-white/5 h-2 rounded-full overflow-hidden">
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
                  <div className="bg-[#111827]/40 border border-white/5 rounded-2xl p-6 backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border-2 ${
                        selectedMember.currentStatus === "active" ? "border-emerald-500 text-emerald-400 bg-emerald-500/5 animate-pulse" :
                        selectedMember.currentStatus === "idle" ? "border-amber-500 text-amber-400 bg-amber-500/5" :
                        "border-slate-800 text-slate-400 bg-slate-900"
                      }`}>
                        {selectedMember.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-md font-bold text-white flex items-center gap-2">
                          <span>{selectedMember.name}</span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold border ${
                            selectedMember.currentStatus === "active" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
                            selectedMember.currentStatus === "idle" ? "bg-amber-500/10 border-amber-500/30 text-amber-400" :
                            "bg-slate-800/80 border-slate-700 text-slate-400"
                          }`}>
                            <span className={`w-1 h-1 rounded-full ${selectedMember.currentStatus === "active" ? "bg-emerald-400" : selectedMember.currentStatus === "idle" ? "bg-amber-400" : "bg-slate-500"}`} />
                            <span>{selectedMember.currentStatus.toUpperCase()}</span>
                          </span>
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">{selectedMember.email}</p>
                        <p className="text-[9px] text-slate-500 uppercase tracking-wider mt-1">Role: {selectedMember.role}</p>
                      </div>
                    </div>
                    
                    {selectedMember.lastActive && (
                      <div className="text-right text-xs text-slate-500 space-y-1">
                        <p>Last Sync: <span className="text-slate-300 font-medium">{formatDate(selectedMember.lastActive)} {formatTime(selectedMember.lastActive)}</span></p>
                        {selectedMember.lastUrl && (
                          <p className="truncate max-w-xs text-[10px] text-blue-400" title={selectedMember.lastUrl}>
                            Active URL: <a href={selectedMember.lastUrl} target="_blank" rel="noreferrer" className="hover:underline">{selectedMember.lastUrl}</a>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Visual Horizontal Timeline Bar */}
              <div className="bg-[#111827]/40 border border-white/5 rounded-2xl p-6 backdrop-blur-md space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Visual Day Timeline</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">Chronological active session blocks, paused breaks, and idle states today</p>
                </div>
                {(() => {
                  if (profileTimelineEvents.length === 0) {
                    return (
                      <div className="h-10 bg-slate-900/30 border border-white/5 border-dashed rounded-xl flex items-center justify-center text-xs text-slate-500 italic">
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
                      <div className="w-full h-5 bg-slate-900 border border-white/5 rounded-full overflow-hidden flex select-none">
                        {blocks.map((block, idx) => (
                          <div 
                            key={idx}
                            style={{ width: `${block.widthPercent}%` }}
                            className={`h-full border-r border-slate-950/20 last:border-0 hover:brightness-110 transition-all cursor-help ${
                              block.type === "active" ? "bg-emerald-500" :
                              block.type === "paused" ? "bg-amber-500" : "bg-slate-600"
                            }`}
                            title={block.title}
                          />
                        ))}
                      </div>
                      <div className="flex gap-4 text-[10px] justify-center pt-1 border-t border-white/[0.02]">
                        <span className="flex items-center gap-1.5 text-emerald-400">
                          <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
                          <span>Active / Work time</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-amber-400">
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
                        <div className="bg-[#111827]/40 border border-white/5 rounded-xl p-4 backdrop-blur-md">
                          <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block mb-1">Active Time</span>
                          <h4 className="text-lg font-bold text-emerald-400">{formatDurationMs(selectedMember?.activeTimeTodayMs || 0)}</h4>
                          <span className="text-[9px] text-slate-500">Working hours today</span>
                        </div>
                        <div className="bg-[#111827]/40 border border-white/5 rounded-xl p-4 backdrop-blur-md">
                          <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block mb-1">Focus Ratio</span>
                          <h4 className="text-lg font-bold text-purple-400">{selectedMember?.focusRatioToday || 0}%</h4>
                          <span className="text-[9px] text-slate-500">Work percentage today</span>
                        </div>
                        <div className="bg-[#111827]/40 border border-white/5 rounded-xl p-4 backdrop-blur-md">
                          <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block mb-1">Done Today</span>
                          <h4 className="text-lg font-bold text-white">{selectedMember?.tasksCompletedToday || 0} tasks</h4>
                          <span className="text-[9px] text-slate-500">Completed tasks today</span>
                        </div>
                        <div className="bg-[#111827]/40 border border-white/5 rounded-xl p-4 backdrop-blur-md">
                          <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block mb-1">Pause Breaks</span>
                          <h4 className="text-lg font-bold text-amber-400">{selectedMember?.pauseCountToday || 0} times</h4>
                          <span className="text-[9px] text-slate-500">Pause states today</span>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Visual Screenshots Strip */}
                  <div className="bg-[#111827]/40 border border-white/5 rounded-2xl p-6 backdrop-blur-md space-y-4">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Visual Audit Capture Strip</h4>
                      <span className="text-[9px] text-slate-500">Recent desktop captures</span>
                    </div>
                    {profileScreenshots.length === 0 ? (
                      <div className="h-24 flex items-center justify-center text-slate-500 text-xs italic bg-slate-900/20 border border-white/5 border-dashed rounded-xl">
                        No recent screen captures saved for this user.
                      </div>
                    ) : (
                      <div className="flex gap-4 overflow-x-auto pb-2 pr-1 scrollbar-thin">
                        {profileScreenshots.map(screen => (
                          <div 
                            key={screen.id} 
                            onClick={() => setLightboxImg({
                              src: screen.imageUrl,
                              title: screen.title,
                              email: screen.email,
                              time: `${formatDate(screen.timestamp)} ${formatTime(screen.timestamp)}`
                            })}
                            className="w-40 aspect-video rounded-lg overflow-hidden border border-white/5 cursor-pointer hover:border-blue-500/50 transition-all shrink-0 bg-slate-950 relative group"
                          >
                            <img src={screen.imageUrl} alt={screen.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Eye className="w-5 h-5 text-white" />
                            </div>
                            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 text-[8px] text-slate-400 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                              {formatTime(screen.timestamp)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Task Lifecycle Log Table */}
                  <div className="bg-[#111827]/40 border border-white/5 rounded-2xl p-6 backdrop-blur-md space-y-4">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Task Progress History</h4>
                      <span className="text-[9px] text-slate-500 font-mono">Showing last 50 tasks</span>
                    </div>

                    <div className="overflow-x-auto max-h-[20rem]">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-white/5 text-slate-500 font-semibold uppercase tracking-wider">
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
                              <tr key={evt.id} className="border-b border-white/[0.02] last:border-0 hover:bg-white/[0.01]">
                                <td className="py-2.5 px-3">
                                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-semibold border ${
                                    evt.event_type === "TASK_COMPLETED" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
                                    evt.event_type === "TASK_SKIPPED" ? "bg-amber-500/10 border-amber-500/30 text-amber-400" :
                                    evt.event_type === "TASK_STARTED" ? "bg-blue-500/10 border-blue-500/30 text-blue-400" :
                                    "bg-red-500/10 border-red-500/30 text-red-400"
                                  }`}>
                                    <span>{evt.event_type === "TASK_COMPLETED" ? "Completed" : evt.event_type === "TASK_SKIPPED" ? "Skipped" : evt.event_type === "TASK_STARTED" ? "Started" : "Left"}</span>
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-slate-300 font-mono select-all truncate max-w-[80px]" title={evt.project_id}>
                                  {evt.project_id || "N/A"}
                                </td>
                                <td className="py-2.5 px-3 text-slate-300 font-mono select-all truncate max-w-[80px]" title={evt.data_id}>
                                  {evt.data_id || "N/A"}
                                </td>
                                <td className="py-2.5 px-3 text-slate-400">
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
                  <div className="bg-[#111827]/40 border border-white/5 rounded-2xl p-6 backdrop-blur-md space-y-4">
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Active Domain Distribution</h4>
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
                                    <span className="font-semibold text-slate-300 truncate max-w-[120px]" title={domain}>{domain}</span>
                                    <span className="text-slate-500 font-medium">{formatDurationMs(duration)} ({percent}%)</span>
                                  </div>
                                  <div className="w-full bg-slate-900 border border-white/5 h-1.5 rounded-full overflow-hidden">
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
                  <div className="bg-[#111827]/40 border border-white/5 rounded-2xl p-6 backdrop-blur-md space-y-4">
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Encord Pages Breakdown</h4>
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
                                <span className="font-semibold text-slate-300">{title}</span>
                                <span className="text-slate-500 font-medium">{formatDurationMs(duration)} ({percent}%)</span>
                              </div>
                              <div className="w-full bg-slate-900 border border-white/5 h-1.5 rounded-full overflow-hidden">
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
                  <div className="bg-[#111827]/40 border border-white/5 rounded-2xl p-6 backdrop-blur-md space-y-4">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Granular Chronology Feed</h4>
                      <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">Last 300</span>
                    </div>

                    <div className="max-h-[30rem] overflow-y-auto space-y-3.5 pr-1 text-xs">
                      {timelineLogs.length === 0 ? (
                        <p className="text-center text-slate-500 italic py-6">No telemetry logs found.</p>
                      ) : (
                        timelineLogs.map(log => (
                          <div key={log.id} className="border-l border-blue-500/20 pl-3 py-1 space-y-1 relative group">
                            <div className="absolute -left-[5.5px] top-1.5 w-2.5 h-2.5 bg-slate-950 border border-blue-500/50 rounded-full" />
                            <div className="flex justify-between items-center text-[10px]">
                              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                                {getEventIcon(log.event_type)}
                                <span>{log.event_type}</span>
                              </span>
                              <span className="text-slate-500 font-mono">{formatTime(log.timestamp)}</span>
                            </div>
                            {log.title && <p className="text-slate-400 font-medium truncate" title={log.title}>{log.title}</p>}
                            {log.url && <p className="text-[10px] text-blue-400 truncate hover:underline" title={log.url}><a href={log.url} target="_blank" rel="noreferrer">{log.url}</a></p>}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ========================================================
              SCREENSHOTS TAB
             ======================================================== */}
          {activeTab === "screenshots" && (
            <div className="space-y-6">
              <div className="bg-[#111827]/40 border border-white/5 rounded-2xl p-4 flex items-center justify-between backdrop-blur-md">
                <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Screenshot Feed Filtering</span>
                <span className="text-[10px] text-slate-500">Only visual evidence on non-private sites is recorded</span>
              </div>

              {isLoadingScreenshots ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                  <RotateCw className="w-8 h-8 animate-spin text-blue-500" />
                  <span className="text-sm">Loading visual captures...</span>
                </div>
              ) : screenshots.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500 text-xs border border-white/[0.02] border-dashed rounded-xl">
                  No visual screenshots recorded yet. Verify that active sessions are running.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  {screenshots.map(screen => {
                    const blocked = isBlockedTab(screen.url)
                    return (
                      <div key={screen.id} className="bg-[#111827]/40 border border-white/5 rounded-xl overflow-hidden relative group hover:border-white/10 transition-all flex flex-col h-full">
                        {/* Thumbnail View */}
                        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden border-b border-white/5 shrink-0">
                          {blocked ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-slate-900 text-center gap-2">
                              <AlertTriangle className="w-6 h-6 text-yellow-500 animate-bounce" />
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Private Blocked Page</p>
                              <p className="text-[8px] text-slate-600">Visuals excluded on WhatsApp/Instagram</p>
                            </div>
                          ) : (
                            <>
                              <img
                                src={screen.imageUrl}
                                alt={screen.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <button
                                  onClick={() => setLightboxImg({
                                    src: screen.imageUrl,
                                    title: screen.title,
                                    email: screen.email,
                                    time: `${formatDate(screen.timestamp)} ${formatTime(screen.timestamp)}`
                                  })}
                                  className="p-2 bg-blue-600 rounded-xl text-white shadow-lg flex items-center gap-1 text-xs font-semibold cursor-pointer hover:bg-blue-500 active:scale-95 transition-all"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>View Screen</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Screenshot Metadata Info */}
                        <div className="p-4 flex-1 flex flex-col justify-between">
                          <div className="space-y-1">
                            <p className="text-[9px] text-blue-400 font-bold uppercase tracking-wider truncate" title={screen.email}>
                              {screen.email.split("@")[0]}
                            </p>
                            <p className="text-xs font-bold text-slate-200 truncate" title={screen.title}>
                              {screen.title}
                            </p>
                            <p className="text-[10px] text-slate-500 truncate" title={screen.url}>
                              {screen.url}
                            </p>
                          </div>
                          <div className="border-t border-white/5 pt-3 mt-3 flex items-center justify-between text-[9px] text-slate-500">
                            <span className="font-semibold">{formatTime(screen.timestamp)}</span>
                            <span>{formatDate(screen.timestamp)}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Lightbox Modal */}
      {lightboxImg && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 select-none animate-fadeIn">
          {/* Header Info */}
          <div className="w-full max-w-6xl flex items-center justify-between text-slate-400 text-xs mb-3">
            <div className="overflow-hidden mr-4">
              <h4 className="text-white font-bold text-sm truncate">{lightboxImg.title}</h4>
              <p className="text-[10px] text-slate-500 mt-0.5 truncate">User: {lightboxImg.email} | Captured: {lightboxImg.time}</p>
            </div>
            <button
              onClick={() => setLightboxImg(null)}
              className="p-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Image Loader Frame */}
          <div className="w-full max-w-6xl max-h-[85vh] bg-slate-900 border border-white/5 rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center">
            <img
              src={lightboxImg.src}
              alt={lightboxImg.title}
              className="w-auto h-auto max-w-full max-h-[85vh] object-contain select-text"
            />
          </div>
        </div>
      )}
    </div>
  )
}
