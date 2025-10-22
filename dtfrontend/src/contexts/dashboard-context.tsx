"use client"

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { dashboardService } from '@/services/dashboard';
import { DashboardList, Dashboard } from '@/types/dashboard';

interface DashboardContextType {
  dashboards: DashboardList[];
  loading: boolean;
  error: string | null;
  refreshDashboards: () => Promise<void>;
  addDashboardToList: (newDashboard: Dashboard) => void;
  updateDashboardInList: (updatedDashboard: Dashboard) => void;
  removeDashboardFromList: (dashboardId: number) => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

interface DashboardProviderProps {
  children: ReactNode;
}

export function DashboardProvider({ children }: DashboardProviderProps) {
  const [dashboards, setDashboards] = useState<DashboardList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshDashboards = useCallback(async () => {
    try {
      setError(null);
      const dashboardData = await dashboardService.getDashboards();
      setDashboards(dashboardData);
    } catch (error) {
      console.error("Failed to fetch dashboards:", error);
      setError("Ekranlar yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  const addDashboardToList = useCallback((newDashboard: Dashboard) => {
    const dashboardListItem: DashboardList = {
      id: newDashboard.id,
      title: newDashboard.title,
      is_public: newDashboard.is_public ?? false,
      owner_id: newDashboard.owner_id,
      owner_name: newDashboard.owner_name,
      layout_config: newDashboard.layout_config,
      widgets: newDashboard.widgets,
      created_at: newDashboard.created_at,
      updated_at: newDashboard.updated_at,
    };
    setDashboards(prev => [...prev, dashboardListItem]);
  }, []);

  const updateDashboardInList = useCallback((updatedDashboard: Dashboard) => {
    setDashboards(prev => 
      prev.map(dashboard => 
        dashboard.id === updatedDashboard.id 
          ? { 
              ...dashboard, 
              title: updatedDashboard.title, 
              is_public: updatedDashboard.is_public ?? dashboard.is_public 
            }
          : dashboard
      )
    );
  }, []);

  const removeDashboardFromList = useCallback((dashboardId: number) => {
    setDashboards(prev => prev.filter(dashboard => dashboard.id !== dashboardId));
  }, []);

  const value: DashboardContextType = {
    dashboards,
    loading,
    error,
    refreshDashboards,
    addDashboardToList,
    updateDashboardInList,
    removeDashboardFromList,
  };

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboards() {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error('useDashboards must be used within a DashboardProvider');
  }
  return context;
}
