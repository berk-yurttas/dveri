import type { Metadata } from "next";
import "./globals.css";

import { AppLayout } from "@/components/app-layout";
import { DashboardProvider } from "@/contexts/dashboard-context";
import { UserProvider } from "@/contexts/user-context";

export const metadata: Metadata = {
  title: "DT Report Frontend",
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
        <UserProvider>
          <DashboardProvider>
            <AppLayout>{children}</AppLayout>
          </DashboardProvider>
        </UserProvider>
      </body>
    </html>
  );
}
