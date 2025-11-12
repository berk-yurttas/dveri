"use client"

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Settings, MessageSquare } from "lucide-react";

export default function AdminSidebar() {
  const pathname = usePathname();
  
  const menuItems = [
    {
      title: "Platform Yönetimi",
      icon: Settings,
      href: "/admin/platforms",
      isActive: pathname?.startsWith("/admin/platforms"),
    },
    {
      title: "Duyuru Yönetimi",
      icon: MessageSquare,
      href: "/admin/announcements",
      isActive: pathname?.startsWith("/admin/announcements"),
    },
  ];

  return (
    <aside className="w-64 bg-white border-r border-gray-200 min-h-screen p-4">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 px-3 py-2">
          Yönetim Paneli
        </h2>
      </div>
      
      <nav className="space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                item.isActive
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Icon className={`h-5 w-5 ${item.isActive ? "text-blue-700" : "text-gray-500"}`} />
              <span>{item.title}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

