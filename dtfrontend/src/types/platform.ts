/**
 * Platform Type Definitions
 * 
 * Type definitions for multi-tenant platform system
 */

export interface Platform {
  id: number;
  code: string;
  name: string;
  display_name: string;
  description: string | null;
  db_type: string;
  db_config?: Record<string, any> | null;
  logo_url: string | null;
  theme_config: {
    textColor?: string;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    headerColor?: string;
    leftLogo?: string;
    order?: number;
    underConstruction?: boolean;
    features?: {
      title: string;
      description: string;
      icon: string;
      iconColor: string;
      backgroundColor: string;
      imageUrl?: string;
      useImage: boolean;
      url?: string;
      allowed_departments?: string[];
      allowed_users?: string[];
    }[];
  } | null;
  is_active: boolean;
  allowed_departments?: string[];
  allowed_users?: string[];
  created_at: string;
  updated_at?: string | null;
}

export interface PlatformStats {
  platform_id: number;
  platform_code: string;
  platform_name: string;
  dashboard_count: number;
  report_count: number;
  user_count: number;
}

export interface PlatformWithStats extends Platform {
  dashboard_count: number;
  report_count: number;
  user_count: number;
}

export interface PlatformCreate {
  code: string;
  name: string;
  display_name: string;
  description?: string | null;
  db_type: string;
  db_config?: Record<string, any> | null;
  logo_url?: string | null;
  theme_config?: Record<string, any> | null;
  is_active?: boolean;
  allowed_departments?: string[];
  allowed_users?: string[];
}

export interface PlatformUpdate {
  name?: string;
  display_name?: string;
  description?: string | null;
  db_type?: string;
  db_config?: Record<string, any> | null;
  logo_url?: string | null;
  theme_config?: Record<string, any> | null;
  is_active?: boolean;
  allowed_departments?: string[];
  allowed_users?: string[];
}

export interface PlatformConnectionTest {
  success: boolean;
  message: string;
  connection_time_ms?: number | null;
  error?: string | null;
}

export type DatabaseType = 'clickhouse' | 'mssql' | 'postgresql';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  driver?: string; // For MSSQL
  connection_string?: string; // Alternative to individual fields
  settings?: Record<string, any>; // Additional settings
}

