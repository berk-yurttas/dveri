import type { Metadata } from "next";
import "./globals.css";

import { AppLayout } from "@/components/app-layout";
import { DashboardProvider } from "@/contexts/dashboard-context";
import { UserProvider } from "@/contexts/user-context";
import { FilterProvider } from "@/contexts/filter-context";
import { PlatformProvider } from "@/contexts/platform-context";

export const metadata: Metadata = {
  title: "Aselsan MİRAS",
  description: "Digital Transformation Report Frontend Application",
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <PlatformProvider>
          <UserProvider>
            <FilterProvider>
              <DashboardProvider>
                <AppLayout>{children}</AppLayout>
              </DashboardProvider>
            </FilterProvider>
          </UserProvider>
        </PlatformProvider>
      </body>
    </html>
  );
}
