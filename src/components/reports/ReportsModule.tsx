import React, { useState, useEffect, useMemo } from 'react';
import { usePortal } from '../../context/PortalContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Activity, BarChart2 } from 'lucide-react';

export const ReportsModule: React.FC = () => {
  const { userRole, currentUser } = usePortal();
  const [allMoods, setAllMoods] = useState<any[]>([]);
  const [filter, setFilter] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  
  const currentUserId = currentUser?.id;

  useEffect(() => {
    if (userRole === 'manager' && currentUserId) {
      fetch('/api/moods/dashboard', { headers: { 'X-User-Id': currentUserId } })
        .then(res => {
          if (res.ok) return res.json();
          throw new Error('Not authorized');
        })
        .then(setAllMoods)
        .catch(console.error);
    }
  }, [userRole, currentUserId]);

  const data = useMemo(() => {
    const getPastDateStr = (offsetDays: number) => {
      const d = new Date();
      d.setDate(d.getDate() - offsetDays);
      return d.toLocaleDateString('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/([۰-۹])/g, char => String.fromCharCode(char.charCodeAt(0) - 1728));
    };

    let allowedDates = new Set<string>();
    if (filter === 'daily') {
      allowedDates.add(getPastDateStr(0));
    } else if (filter === 'weekly') {
      for (let i = 0; i < 7; i++) allowedDates.add(getPastDateStr(i));
    } else if (filter === 'monthly') {
      for (let i = 0; i < 30; i++) allowedDates.add(getPastDateStr(i));
    }

    const filteredMoods = allMoods.filter(m => allowedDates.has(m.date));

    const moodCounts: Record<string, number> = {
      'عالی': 0,
      'خوب': 0,
      'معمولی': 0,
      'بد': 0,
      'خیلی بد': 0
    };

    filteredMoods.forEach(m => {
      if (moodCounts[m.mood] !== undefined) moodCounts[m.mood]++;
    });

    return [
      { name: 'خیلی بد', count: moodCounts['خیلی بد'], color: '#f87171' },
      { name: 'بد', count: moodCounts['بد'], color: '#fca5a5' },
      { name: 'معمولی', count: moodCounts['معمولی'], color: '#d4d4d8' },
      { name: 'خوب', count: moodCounts['خوب'], color: '#991b1b' },
      { name: 'عالی', count: moodCounts['عالی'], color: '#dc2626' }
    ];
  }, [allMoods, filter]);

  if (userRole !== 'manager') return null;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl p-6 border border-[#e5e5e5] shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#e5e5e5]">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[#fdfbf7] text-[#991b1b] rounded-2xl border border-[#f5f2ed]">
              <BarChart2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-[#2d2d2d]">گزارشات و آمار</h2>
              <p className="text-sm text-[#6e6a60] mt-1">نمایش وضعیت احساسی سازمان</p>
            </div>
          </div>
          <div className="flex bg-[#F5F2ED] rounded-xl p-1 border border-[#E6E0D5]">
            <button
              onClick={() => setFilter('daily')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${filter === 'daily' ? 'bg-white text-[#dc2626] shadow-sm' : 'text-[#8C867A] hover:text-[#2D2D2D]'}`}
            >
              روزانه (امروز)
            </button>
            <button
              onClick={() => setFilter('weekly')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${filter === 'weekly' ? 'bg-white text-[#dc2626] shadow-sm' : 'text-[#8C867A] hover:text-[#2D2D2D]'}`}
            >
              هفتگی
            </button>
            <button
              onClick={() => setFilter('monthly')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${filter === 'monthly' ? 'bg-white text-[#dc2626] shadow-sm' : 'text-[#8C867A] hover:text-[#2D2D2D]'}`}
            >
              ماهانه
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#fdfbf7] text-[#991b1b] rounded-xl">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-[#2d2d2d]">وضعیت احساسی سازمان</h3>
              <p className="text-xs text-[#6e6a60]">گزارش تجمیعی نظرسنجی همکاران در بازه انتخابی</p>
            </div>
          </div>
          <div className="h-64 w-full mt-4" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6e6a60' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#6e6a60' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: '#f5f2ed' }}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e5e5e5', fontSize: '12px', textAlign: 'right' }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
