import { useGetAdminStats, useGetRecentBookings } from "@workspace/api-client-react";
import { STATUS_COLORS } from "@/lib/constants";
import { format } from "date-fns";
import { Loader2, Users, Car, DollarSign, Calendar, Activity } from "lucide-react";
import { Link } from "wouter";

export default function Admin() {
  const { data: stats, isLoading: statsLoading } = useGetAdminStats();
  const { data: bookings, isLoading: bookingsLoading } = useGetRecentBookings({ limit: 10 });

  if (statsLoading || bookingsLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] pt-32 pb-24">
      <div className="container mx-auto px-6">
        <div className="flex justify-between items-end mb-12">
          <div>
            <h1 className="text-3xl font-serif text-white mb-2">Director's Office</h1>
            <p className="text-gray-400">System overview and real-time operations.</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-widest text-primary mb-1">System Status</p>
            <p className="text-white text-sm flex items-center"><span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span> Operational</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <div className="bg-black border border-white/10 p-6 flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-white/5 rounded-full"><DollarSign className="w-5 h-5 text-primary" /></div>
              <span className="text-xs text-green-500 bg-green-500/10 px-2 py-1 rounded">+12%</span>
            </div>
            <div>
              <p className="text-gray-500 uppercase tracking-widest text-xs mb-1">Revenue Today</p>
              <h3 className="text-3xl font-serif text-white">${stats?.totalRevenue.toLocaleString() || '0'}</h3>
            </div>
          </div>

          <div className="bg-black border border-white/10 p-6 flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-white/5 rounded-full"><Activity className="w-5 h-5 text-primary" /></div>
            </div>
            <div>
              <p className="text-gray-500 uppercase tracking-widest text-xs mb-1">Active Rides</p>
              <h3 className="text-3xl font-serif text-white">{stats?.activeBookings || 0}</h3>
            </div>
          </div>

          <div className="bg-black border border-white/10 p-6 flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-white/5 rounded-full"><Users className="w-5 h-5 text-primary" /></div>
            </div>
            <div>
              <p className="text-gray-500 uppercase tracking-widest text-xs mb-1">Active Drivers</p>
              <h3 className="text-3xl font-serif text-white">{stats?.activeDrivers || 0} <span className="text-sm text-gray-600 font-sans">/ {stats?.totalDrivers || 0}</span></h3>
            </div>
          </div>

          <div className="bg-black border border-white/10 p-6 flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-white/5 rounded-full"><Car className="w-5 h-5 text-primary" /></div>
            </div>
            <div>
              <p className="text-gray-500 uppercase tracking-widest text-xs mb-1">Available Fleet</p>
              <h3 className="text-3xl font-serif text-white">{stats?.availableVehicles || 0} <span className="text-sm text-gray-600 font-sans">/ {stats?.fleetSize || 0}</span></h3>
            </div>
          </div>
        </div>

        {/* Recent Bookings Table */}
        <div className="bg-black border border-white/10 p-8">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-serif text-white">Recent Operations</h2>
            <Link href="/admin/bookings" className="text-primary text-xs uppercase tracking-widest hover:text-white transition-colors">View All</Link>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-gray-500 uppercase tracking-widest text-xs border-b border-white/10">
                <tr>
                  <th className="pb-4 font-medium">Ref / Date</th>
                  <th className="pb-4 font-medium">Client</th>
                  <th className="pb-4 font-medium">Route</th>
                  <th className="pb-4 font-medium">Vehicle</th>
                  <th className="pb-4 font-medium text-right">Value</th>
                  <th className="pb-4 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {bookings?.map((booking) => (
                  <tr key={booking.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-4">
                      <div className="text-white font-mono mb-1">RM-{booking.id.toString().padStart(4, '0')}</div>
                      <div className="text-gray-500 text-xs flex items-center">
                        <Calendar className="w-3 h-3 mr-1" />
                        {format(new Date(booking.pickupAt), "MMM d, HH:mm")}
                      </div>
                    </td>
                    <td className="py-4 text-gray-300">{booking.passengerName}</td>
                    <td className="py-4 text-gray-400 text-xs max-w-[200px] truncate" title={`${booking.pickupAddress} → ${booking.dropoffAddress}`}>
                      {booking.pickupAddress.split(',')[0]} <br/> <span className="text-gray-600">to</span> {booking.dropoffAddress.split(',')[0]}
                    </td>
                    <td className="py-4 text-gray-300 capitalize">{booking.vehicleClass.replace('_', ' ')}</td>
                    <td className="py-4 text-white text-right font-mono">${booking.priceQuoted}</td>
                    <td className="py-4 text-right">
                      <span className={`inline-block px-3 py-1 text-xs uppercase tracking-widest border ${STATUS_COLORS[booking.status]}`}>
                        {booking.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
                {(!bookings || bookings.length === 0) && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">No recent bookings found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
