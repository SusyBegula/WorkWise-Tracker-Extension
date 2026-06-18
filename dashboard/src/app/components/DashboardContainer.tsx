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
  X
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

export default function DashboardContainer({ session }: { session: Session }) {
  const [activeTab, setActiveTab] = useState<"overview" | "timeline" | "screenshots">("overview")
  const [selectedUser, setSelectedUser] = useState<string>("")
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [eventDistribution, setEventDistribution] = useState<EventDist[]>([])
  const [hourlyActivity, setHourlyActivity] = useState<HourlyAct[]>([])
  const [timelineLogs, setTimelineLogs] = useState<ActivityLog[]>([])
  const [timelineStats, setTimelineStats] = useState<EventDist[]>([])
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  
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
            onClick={() => setActiveTab("overview")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
              activeTab === "overview"
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
            <h2 className="text-lg font-bold text-white uppercase tracking-wider">
              {activeTab === "overview" && "Team Overview"}
              {activeTab === "timeline" && "Employee Timeline Detailed Logs"}
              {activeTab === "screenshots" && "Visual Proof-Of-Work Feed"}
            </h2>
          </div>

          {/* User selection sync bar for subtabs */}
          {activeTab !== "overview" && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Focus User:</span>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="bg-slate-900/80 border border-white/10 text-slate-200 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-blue-500/30 cursor-pointer"
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

          {activeTab === "overview" && (
            <button 
              onClick={fetchOverviewData}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-white/5 hover:bg-white/5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <RotateCw className="w-3 h-3" />
              <span>Refresh Overview</span>
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
             ======================================================== */}
          {activeTab === "overview" && (
            <>
              {isLoadingOverview ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                  <RotateCw className="w-8 h-8 animate-spin text-blue-500" />
                  <span className="text-sm">Loading summary metrics...</span>
                </div>
              ) : (
                <div className="space-y-6">
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
                      <table className="w-full text-left text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider select-none">
                            <th className="px-6 py-4 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("name")}>
                              <div className="flex items-center gap-1">
                                <span>Employee</span>
                                <span className="text-[10px] opacity-75">{sortBy === "name" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}</span>
                              </div>
                            </th>
                            <th className="px-6 py-4 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("isTrackingActive")}>
                              <div className="flex items-center gap-1">
                                <span>Current Status</span>
                                <span className="text-[10px] opacity-75">{sortBy === "isTrackingActive" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}</span>
                              </div>
                            </th>
                            <th className="px-6 py-4 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("eventCount")}>
                              <div className="flex items-center gap-1">
                                <span>Total events</span>
                                <span className="text-[10px] opacity-75">{sortBy === "eventCount" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}</span>
                              </div>
                            </th>
                            <th className="px-6 py-4 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("screenshotCount")}>
                              <div className="flex items-center gap-1">
                                <span>Saved screens</span>
                                <span className="text-[10px] opacity-75">{sortBy === "screenshotCount" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}</span>
                              </div>
                            </th>
                            <th className="px-6 py-4 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("lastActive")}>
                              <div className="flex items-center gap-1">
                                <span>Last Telemetry Timestamp</span>
                                <span className="text-[10px] opacity-75">{sortBy === "lastActive" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}</span>
                              </div>
                            </th>
                            <th className="px-6 py-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAndSortedMembers.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-8 text-center text-slate-500 text-xs">
                                No employees match the selected filters.
                              </td>
                            </tr>
                          ) : (
                            filteredAndSortedMembers.map(member => (
                              <tr key={member.email} className="border-b border-white/5 hover:bg-white/[0.01] transition-colors">
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center font-bold text-slate-300 text-xs shrink-0">
                                      {member.name.substring(0,2).toUpperCase()}
                                    </div>
                                    <div>
                                      <p className="text-xs font-bold text-slate-200">{member.name}</p>
                                      <p className="text-[10px] text-slate-500 truncate w-40">{member.email}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                                    member.isTrackingActive
                                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                      : "bg-slate-800/80 border-slate-700 text-slate-400"
                                  }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${member.isTrackingActive ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
                                    <span>{member.isTrackingActive ? "Active" : "Offline"}</span>
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-slate-300 text-xs">
                                  {member.eventCount.toLocaleString()}
                                </td>
                                <td className="px-6 py-4 text-slate-300 text-xs">
                                  {member.screenshotCount}
                                </td>
                                <td className="px-6 py-4 text-slate-400 text-xs">
                                  {member.lastActive ? `${formatDate(member.lastActive)} ${formatTime(member.lastActive)}` : "--:--"}
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <button
                                    onClick={() => {
                                      setSelectedUser(member.email)
                                      setActiveTab("timeline")
                                    }}
                                    className="p-1.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 hover:border-blue-500/40 rounded-lg transition-all text-xs font-semibold flex items-center gap-1 inline-flex cursor-pointer"
                                  >
                                    <span>Audit</span>
                                    <ArrowRight className="w-3 h-3" />
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
              TIMELINES TAB
             ======================================================== */}
          {activeTab === "timeline" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left stats panel */}
              <div className="lg:col-span-1 space-y-6">
                <div className="bg-[#111827]/40 border border-white/5 rounded-2xl p-6 backdrop-blur-md">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Employee Metrics</h3>
                  <div className="space-y-4">
                    <div>
                      <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mb-1">User Audit Target</span>
                      <p className="text-sm font-bold text-white truncate">{selectedUser}</p>
                    </div>
                    
                    {/* Event count distribution list */}
                    <div className="border-t border-white/5 pt-4">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mb-3">Activities Summary</span>
                      {isLoadingTimeline ? (
                        <span className="text-xs text-slate-500">Calculating...</span>
                      ) : timelineStats.length === 0 ? (
                        <span className="text-xs text-slate-500">No activity data found.</span>
                      ) : (
                        <div className="space-y-3">
                          {timelineStats.map(stat => (
                            <div key={stat.event_type} className="flex items-center justify-between text-xs py-1.5 border-b border-white/[0.02] last:border-0">
                              <span className="text-slate-400 flex items-center gap-2">
                                {getEventIcon(stat.event_type)}
                                <span>{stat.event_type}</span>
                              </span>
                              <span className="font-bold text-slate-200">{stat.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right timeline feed */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-[#111827]/40 border border-white/5 rounded-2xl backdrop-blur-md flex flex-col max-h-[80vh]">
                  <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Granular Chronological Activity Logs</h3>
                    <span className="text-[10px] text-slate-500">Showing last 300 logs</span>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {isLoadingTimeline ? (
                      <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                        <RotateCw className="w-6 h-6 animate-spin text-blue-500" />
                        <span className="text-xs">Fetching telemetry timelines...</span>
                      </div>
                    ) : timelineLogs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-slate-500 text-xs border border-white/[0.02] border-dashed rounded-xl">
                        No activity logs recorded yet for this user.
                      </div>
                    ) : (
                      <div className="relative border-l border-white/5 ml-4 pl-6 space-y-6">
                        {timelineLogs.map(log => (
                          <div key={log.id} className="relative group">
                            {/* Dot on the timeline */}
                            <div className="absolute -left-[31px] top-1.5 w-3.5 h-3.5 bg-slate-900 border-2 border-blue-500 rounded-full flex items-center justify-center group-hover:scale-125 transition-transform" />
                            
                            <div className="bg-slate-900/40 border border-white/5 rounded-xl p-4 hover:border-white/10 transition-colors">
                              {/* Log Title & Time */}
                              <div className="flex items-center justify-between mb-2">
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-200">
                                  {getEventIcon(log.event_type)}
                                  <span>{log.event_type}</span>
                                </span>
                                <span className="text-[10px] text-slate-500 font-semibold">{formatTime(log.timestamp)}</span>
                              </div>

                              {/* Target Details */}
                              {log.title && (
                                <p className="text-xs text-slate-300 font-semibold mb-1 truncate" title={log.title}>
                                  Title: <span className="text-slate-400 font-normal">{log.title}</span>
                                </p>
                              )}
                              {log.url && (
                                <p className="text-[10px] text-blue-400/80 truncate mb-2" title={log.url}>
                                  Link: <a href={log.url} target="_blank" rel="noreferrer" className="hover:underline">{log.url}</a>
                                </p>
                              )}

                              {/* Log Metadata Details */}
                              {log.metadata && Object.keys(log.metadata).length > 0 && (
                                <div className="bg-black/30 rounded-lg p-2.5 mt-2 border border-white/[0.02]">
                                  <pre className="text-[10px] font-mono text-slate-500 overflow-x-auto whitespace-pre-wrap">
                                    {JSON.stringify(log.metadata, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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
