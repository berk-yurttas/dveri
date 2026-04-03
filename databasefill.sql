--
-- PostgreSQL database dump
--

\restrict tCOjODLxDPXiPqcdKvR34CfbvqxKyP2wFQBCHjdxxMhuE3Gqxl1eyem2BslFjr8

-- Dumped from database version 16.9 (Debian 16.9-1.pgdg120+1)
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

DROP DATABASE IF EXISTS dt_report;
--
-- Name: dt_report; Type: DATABASE; Schema: -; Owner: postgres
--

CREATE DATABASE dt_report WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'en_US.utf8';


ALTER DATABASE dt_report OWNER TO postgres;

\unrestrict tCOjODLxDPXiPqcdKvR34CfbvqxKyP2wFQBCHjdxxMhuE3Gqxl1eyem2BslFjr8
\connect dt_report
\restrict tCOjODLxDPXiPqcdKvR34CfbvqxKyP2wFQBCHjdxxMhuE3Gqxl1eyem2BslFjr8

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


ALTER TABLE public.alembic_version OWNER TO postgres;

--
-- Name: dashboard_users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dashboard_users (
    id integer NOT NULL,
    dashboard_id integer NOT NULL,
    user_id integer NOT NULL,
    is_favorite boolean,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone
);


ALTER TABLE public.dashboard_users OWNER TO postgres;

--
-- Name: dashboard_users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.dashboard_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.dashboard_users_id_seq OWNER TO postgres;

--
-- Name: dashboard_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.dashboard_users_id_seq OWNED BY public.dashboard_users.id;


--
-- Name: dashboards; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dashboards (
    id integer NOT NULL,
    title character varying(200) NOT NULL,
    owner_id integer NOT NULL,
    is_public boolean,
    layout_config jsonb,
    widgets jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    platform_id integer,
    tags character varying[] DEFAULT '{}'::character varying[]
);


ALTER TABLE public.dashboards OWNER TO postgres;

--
-- Name: dashboards_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.dashboards_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.dashboards_id_seq OWNER TO postgres;

--
-- Name: dashboards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.dashboards_id_seq OWNED BY public.dashboards.id;


--
-- Name: platforms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.platforms (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    display_name character varying(255) NOT NULL,
    description text,
    db_type character varying(50) NOT NULL,
    db_config jsonb,
    logo_url character varying(255),
    theme_config jsonb,
    is_active boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone
);


ALTER TABLE public.platforms OWNER TO postgres;

--
-- Name: platforms_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.platforms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.platforms_id_seq OWNER TO postgres;

--
-- Name: platforms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.platforms_id_seq OWNED BY public.platforms.id;


--
-- Name: report_queries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.report_queries (
    id integer NOT NULL,
    report_id integer NOT NULL,
    name character varying(255) NOT NULL,
    sql text NOT NULL,
    visualization_config jsonb NOT NULL,
    order_index integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone
);


ALTER TABLE public.report_queries OWNER TO postgres;

--
-- Name: report_queries_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.report_queries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.report_queries_id_seq OWNER TO postgres;

--
-- Name: report_queries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.report_queries_id_seq OWNED BY public.report_queries.id;


--
-- Name: report_query_filters; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.report_query_filters (
    id integer NOT NULL,
    query_id integer NOT NULL,
    field_name character varying(255) NOT NULL,
    display_name character varying(255) NOT NULL,
    filter_type character varying(50) NOT NULL,
    dropdown_query text,
    required boolean,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    sql_expression text,
    depends_on character varying(255)
);


ALTER TABLE public.report_query_filters OWNER TO postgres;

--
-- Name: report_query_filters_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.report_query_filters_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.report_query_filters_id_seq OWNER TO postgres;

--
-- Name: report_query_filters_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.report_query_filters_id_seq OWNED BY public.report_query_filters.id;


--
-- Name: reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reports (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    owner_id integer NOT NULL,
    is_public boolean,
    tags character varying[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    platform_id integer
);


ALTER TABLE public.reports OWNER TO postgres;

--
-- Name: reports_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.reports_id_seq OWNER TO postgres;

--
-- Name: reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.reports_id_seq OWNED BY public.reports.id;


--
-- Name: user_platforms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_platforms (
    id integer NOT NULL,
    user_id integer NOT NULL,
    platform_id integer NOT NULL,
    role character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone
);


ALTER TABLE public.user_platforms OWNER TO postgres;

--
-- Name: user_platforms_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_platforms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_platforms_id_seq OWNER TO postgres;

--
-- Name: user_platforms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_platforms_id_seq OWNED BY public.user_platforms.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    name character varying(255)
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: dashboard_users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dashboard_users ALTER COLUMN id SET DEFAULT nextval('public.dashboard_users_id_seq'::regclass);


--
-- Name: dashboards id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dashboards ALTER COLUMN id SET DEFAULT nextval('public.dashboards_id_seq'::regclass);


--
-- Name: platforms id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platforms ALTER COLUMN id SET DEFAULT nextval('public.platforms_id_seq'::regclass);


--
-- Name: report_queries id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_queries ALTER COLUMN id SET DEFAULT nextval('public.report_queries_id_seq'::regclass);


--
-- Name: report_query_filters id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_query_filters ALTER COLUMN id SET DEFAULT nextval('public.report_query_filters_id_seq'::regclass);


--
-- Name: reports id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports ALTER COLUMN id SET DEFAULT nextval('public.reports_id_seq'::regclass);


--
-- Name: user_platforms id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_platforms ALTER COLUMN id SET DEFAULT nextval('public.user_platforms_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: alembic_version; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.alembic_version (version_num) FROM stdin;
2c2d1502a14c
\.


--
-- Data for Name: dashboard_users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.dashboard_users (id, dashboard_id, user_id, is_favorite, created_at, updated_at) FROM stdin;
1	10	2	t	2025-09-12 08:36:47.011543+00	2025-09-12 10:14:29.026073+00
2	11	2	f	2025-09-12 10:23:55.781857+00	\N
4	13	2	f	2025-09-29 12:28:38.804965+00	\N
5	14	2	f	2025-09-30 08:10:06.423772+00	\N
6	15	2	f	2025-09-30 08:37:03.9668+00	\N
7	16	2	f	2025-10-03 07:30:23.758965+00	\N
8	17	2	f	2025-10-03 08:07:34.819526+00	\N
9	18	2	f	2025-10-03 08:08:20.448452+00	\N
10	19	2	f	2025-10-03 08:11:34.609774+00	\N
14	23	2	f	2025-10-07 04:44:58.744906+00	\N
15	24	2	f	2025-10-08 10:50:15.148653+00	\N
16	25	2	f	2025-10-08 10:51:40.387154+00	\N
17	26	2	f	2025-10-10 10:50:50.132261+00	\N
19	28	2	f	2025-10-21 11:04:32.541642+00	\N
20	29	2	f	2025-10-22 05:36:33.482429+00	\N
21	30	2	f	2025-10-29 20:13:44.94353+00	\N
22	31	2	f	2025-10-30 06:46:28.926526+00	\N
\.


--
-- Data for Name: dashboards; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.dashboards (id, title, owner_id, is_public, layout_config, widgets, created_at, updated_at, platform_id, tags) FROM stdin;
17	storage test	2	f	{"grid_size": {"width": 6, "height": 6}}	[{"id": "measurement-widget-1759478839837", "title": "Ölçüm Analizi", "width": 4, "config": {"name": "Ölçüm Analizi", "color": "bg-blue-500", "cellIndex": 0}, "height": 1, "position_x": 0, "position_y": 0, "widget_type": "measurement_analysis", "data_source_query": null}]	2025-10-03 08:07:34.779443+00	\N	1	{}
19	testttt	2	f	{"grid_size": {"width": 6, "height": 6}}	[{"id": "measurement-widget-1759479084348", "title": "Ölçüm Analizi", "width": 4, "config": {"name": "Ölçüm Analizi", "color": "bg-blue-500", "cellIndex": 0}, "height": 1, "position_x": 0, "position_y": 0, "widget_type": "measurement_analysis", "data_source_query": null}]	2025-10-03 08:11:34.584399+00	\N	1	{}
25	a	2	f	{"grid_size": {"width": 6, "height": 6}}	[{"id": "product-test-widget-1759920697915", "title": "Ürün Test Analizi", "width": 2, "config": {"name": "Ürün Test Analizi", "color": "bg-blue-500", "iconName": "Layout", "cellIndex": 0}, "height": 2, "position_x": 0, "position_y": 0, "widget_type": "product_test"}]	2025-10-08 10:51:40.366263+00	2025-10-21 11:11:21.028154+00	1	{}
14	test	2	f	{"grid_size": {"width": 6, "height": 6}}	[{"id": "serialno_comparison-1759219801389", "title": "Seri No Karşılaştırma", "width": 4, "config": {"name": "Seri No Karşılaştırma", "color": "bg-indigo-500", "cellIndex": 0}, "height": 2, "position_x": 0, "position_y": 0, "widget_type": "serialno_comparison", "data_source_query": null}]	2025-09-30 08:10:06.370533+00	\N	1	{}
13	araasda	2	f	{"grid_size": {"width": 6, "height": 6}}	[{"id": "efficiency-widget-1759148914945", "title": "Üretim Verimliliği", "width": 2, "config": {"name": "Üretim Verimliliği", "color": "bg-green-500", "cellIndex": 0}, "height": 2, "position_x": 0, "position_y": 0, "widget_type": "efficiency", "data_source_query": null}]	2025-09-29 12:28:38.773415+00	\N	1	{}
15	excel	2	f	{"grid_size": {"width": 6, "height": 6}}	[{"id": "excel-export-widget-1759221408797", "title": "Excel Dışa Aktarım", "width": 1, "config": {"name": "Excel Dışa Aktarım", "color": "bg-orange-500", "cellIndex": 0}, "height": 1, "position_x": 0, "position_y": 0, "widget_type": "excel_export", "data_source_query": null}]	2025-09-30 08:37:03.943239+00	\N	1	{}
18	tes	2	f	{"grid_size": {"width": 6, "height": 6}}	[{"id": "measurement-widget-1759478886005", "title": "Ölçüm Analizi", "width": 4, "config": {"name": "Ölçüm Analizi", "color": "bg-blue-500", "cellIndex": 0}, "height": 1, "position_x": 0, "position_y": 0, "widget_type": "measurement_analysis", "data_source_query": null}]	2025-10-03 08:08:20.426762+00	\N	1	{}
24	test	2	f	{"grid_size": {"width": 6, "height": 6}}	[{"id": "efficiency-widget-1759920591107", "title": "Üretim Verimliliği", "width": 2, "config": {"name": "Üretim Verimliliği", "color": "bg-green-500", "cellIndex": 0}, "height": 2, "position_x": 0, "position_y": 0, "widget_type": "efficiency", "data_source_query": null}, {"id": "product-test-widget-1759920592770", "title": "Ürün Test Analizi", "width": 2, "config": {"name": "Ürün Test Analizi", "color": "bg-blue-500", "cellIndex": 2}, "height": 2, "position_x": 2, "position_y": 0, "widget_type": "product_test", "data_source_query": null}, {"id": "excel-export-widget-1759920596194", "title": "Excel Dışa Aktarım", "width": 1, "config": {"name": "Excel Dışa Aktarım", "color": "bg-orange-500", "cellIndex": 4}, "height": 1, "position_x": 4, "position_y": 0, "widget_type": "excel_export", "data_source_query": null}, {"id": "excel-export-widget-1759920598103", "title": "Excel Dışa Aktarım", "width": 1, "config": {"name": "Excel Dışa Aktarım", "color": "bg-orange-500", "cellIndex": 5}, "height": 1, "position_x": 5, "position_y": 0, "widget_type": "excel_export", "data_source_query": null}, {"id": "test_duration_analysis-1759920601100", "title": "Test Süre Analiz Grafiği", "width": 3, "config": {"name": "Test Süre Analiz Grafiği", "color": "bg-purple-500", "cellIndex": 12}, "height": 2, "position_x": 0, "position_y": 2, "widget_type": "test_duration_analysis", "data_source_query": null}, {"id": "serialno_comparison-1759920603464", "title": "Seri No Karşılaştırma", "width": 4, "config": {"name": "Seri No Karşılaştırma", "color": "bg-indigo-500", "cellIndex": 24}, "height": 2, "position_x": 0, "position_y": 4, "widget_type": "serialno_comparison", "data_source_query": null}, {"id": "excel-export-widget-1759920607294", "title": "Excel Dışa Aktarım", "width": 1, "config": {"name": "Excel Dışa Aktarım", "color": "bg-orange-500", "cellIndex": 28}, "height": 1, "position_x": 4, "position_y": 4, "widget_type": "excel_export", "data_source_query": null}, {"id": "test-analysis-widget-1759920608941", "title": "Test Analizi", "width": 2, "config": {"name": "Test Analizi", "color": "bg-purple-500", "cellIndex": 16}, "height": 2, "position_x": 4, "position_y": 2, "widget_type": "test_analysis", "data_source_query": null}]	2025-10-08 10:50:15.110809+00	\N	1	{}
16	dashh	2	f	{"grid_size": {"width": 6, "height": 6}}	[{"id": "measurement-widget-1759476603220", "title": "Ölçüm Analizi", "width": 4, "config": {"name": "Ölçüm Analizi", "color": "bg-blue-500", "cellIndex": 0}, "height": 1, "position_x": 0, "position_y": 0, "widget_type": "measurement_analysis", "data_source_query": null}]	2025-10-03 07:30:23.715357+00	\N	1	{}
23	asd	2	f	{"grid_size": {"width": 6, "height": 6}}	[{"id": "measurement-widget-1759812288849", "title": "Ölçüm Analizi", "width": 4, "config": {"name": "Ölçüm Analizi", "color": "bg-blue-500", "cellIndex": 0}, "height": 1, "position_x": 0, "position_y": 0, "widget_type": "measurement_analysis", "data_source_query": null}]	2025-10-07 04:44:58.719605+00	\N	1	{}
10	Dash	2	f	{"grid_size": {"width": 6, "height": 6}}	[{"id": "test_duration-widget-1757665216593", "title": "Test Süre Analizi", "width": 2, "config": {"name": "Test Süre Analizi", "color": "bg-orange-500", "cellIndex": 0}, "height": 1, "position_x": 0, "position_y": 0, "widget_type": "test_duration", "data_source_query": null}]	2025-09-12 08:36:47.011543+00	\N	1	{}
11	da	2	f	{"grid_size": {"width": 6, "height": 6}}	[{"id": "product-test-widget-1757672632411", "title": "Ürün Test Analizi", "width": 2, "config": {"name": "Ürün Test Analizi", "color": "bg-blue-500", "cellIndex": 0}, "height": 2, "position_x": 0, "position_y": 0, "widget_type": "product_test", "data_source_query": null}]	2025-09-12 10:23:55.738214+00	\N	1	{}
26	adsad	2	f	{"grid_size": {"width": 6, "height": 6}}	[{"id": "efficiency-widget-1760093397611", "title": "Üretim Verimliliği", "width": 2, "config": {"name": "Üretim Verimliliği", "color": "bg-green-500", "cellIndex": 0}, "height": 2, "position_x": 0, "position_y": 0, "widget_type": "efficiency", "data_source_query": null}, {"id": "test-analysis-widget-1760093441601", "title": "Test Analizi", "width": 2, "config": {"name": "Test Analizi", "color": "bg-purple-500", "cellIndex": 2}, "height": 2, "position_x": 2, "position_y": 0, "widget_type": "test_analysis", "data_source_query": null}]	2025-10-10 10:50:49.962857+00	\N	\N	{}
28	testt	2	f	{"grid_size": {"width": 6, "height": 6}}	[{"id": "capacity_analysis-widget-1761044662898", "title": "Kapasite Analizi", "width": 4, "config": {"name": "Kapasite Analizi", "color": "bg-cyan-500", "cellIndex": 0}, "height": 2, "position_x": 0, "position_y": 0, "widget_type": "capacity_analysis", "data_source_query": null}]	2025-10-21 11:04:32.476602+00	\N	2	{kapasite}
30	tesss	2	f	{"grid_size": {"width": 6, "height": 6}}	[{"id": "kablaj_duruslar-widget-1761768812782", "title": "Kablaj Firma Duruşları", "width": 4, "config": {"name": "Kablaj Firma Duruşları", "color": "bg-amber-500", "cellIndex": 0}, "height": 2, "position_x": 0, "position_y": 0, "widget_type": "kablaj_duruslar", "data_source_query": null}]	2025-10-29 20:13:44.773727+00	\N	2	{}
29	OEE	2	f	{"grid_size": {"width": 6, "height": 6}}	[{"id": "machine_oee-widget-1761111384236", "title": "Makine OEE Analizi", "width": 4, "config": {"name": "Makine OEE Analizi", "color": "bg-purple-500", "iconName": "Layout", "cellIndex": 0}, "height": 2, "position_x": 0, "position_y": 0, "widget_type": "machine_oee"}]	2025-10-22 05:36:33.317511+00	2025-10-30 09:55:36.875549+00	2	{verimlilik}
31	Devamsızlık	2	f	{"grid_size": {"width": 6, "height": 6}}	[{"id": "absenteeism-widget-1761806717578", "title": "Devamsızlık Analizi", "width": 4, "config": {"name": "Devamsızlık Analizi", "color": "bg-orange-500", "iconName": "Layout", "cellIndex": 0}, "height": 2, "position_x": 0, "position_y": 0, "widget_type": "absenteeism"}]	2025-10-30 06:46:28.837776+00	2025-10-30 09:55:15.088977+00	2	{idari}
\.


--
-- Data for Name: platforms; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.platforms (id, code, name, display_name, description, db_type, db_config, logo_url, theme_config, is_active, created_at, updated_at) FROM stdin;
1	deriniz	DerinİZ	DerinİZ	Test verisinin dijital izi. Üretim verisi ile test sonuçlarını tek platformda buluşturuyoruz.	clickhouse	{"host": "localhost", "port": 9000, "user": "default", "database": "default", "password": "ClickHouse@2024", "connection_string": "clickhouse://user:pass@host:port/db"}	http://localhost:8090/api/files/b16hvq5kz10hyii/48s95fqz896oje6/miras_iz_nobg_srshig1c9t.png?token=	{"order": 4, "features": [{"url": "", "icon": "BarChart3", "title": "Test Analizi", "iconColor": "#3B82F6", "description": "Test sonuçlarınızı detaylı olarak analiz edin ve raporlayın", "backgroundColor": "#EFF6FF"}, {"url": "", "icon": "Target", "title": "Verimlilik", "iconColor": "#3da72f", "description": "Test süreçlerinizin verimliliğini takip edin.", "backgroundColor": "#b6f7ba"}, {"url": "", "icon": "Gauge", "title": "Gerçek Zamanlı", "iconColor": "#8b2fac", "description": "Test verilerinizi gerçek zamanlı olarak izleyin.", "backgroundColor": "#fecdfb"}, {"url": "", "icon": "Clock", "title": "Test Süresi", "iconColor": "#f48201", "description": "Test sürelerinizi optimize edin ve takip edin.", "backgroundColor": "#ffd9ad"}], "textColor": "#808080"}	t	2025-10-10 11:08:43.066+00	2025-10-22 13:46:24.154381+00
4	amom	a-MOM	a-MOM	Tasarımı görünür, süreci izlenebilir kılıyoruz. Her süreç bir iz bırakır; biz o akışı yönetiyoruz.	clickhouse	{"host": "localhost", "port": 9000, "user": "default", "database": "dt_report", "password": "ClickHouse@2024", "connection_string": "clickhouse://user:pass@host:port/db"}	http://localhost:8090/api/files/b16hvq5kz10hyii/clu9g5v19jrsw29/miras_akis_nobg_z7dr7k5vy5.png?token=	{"order": 2, "textColor": "#fc5801", "underConstruction": true}	t	2025-10-10 11:08:43.066+00	2025-10-22 13:54:18.298655+00
3	romiot	rom - IoT	rom - IoT	Geleceği birlikte üretiyoruz. İnsan zekası ile robotik gücü birleştiriyoruz	clickhouse	{"host": "localhost", "port": 9000, "user": "default", "database": "dt_report", "password": "ClickHouse@2024", "connection_string": "clickhouse://user:pass@host:port/db"}	http://localhost:8090/api/files/b16hvq5kz10hyii/c7rs7yofm029ev0/miras_bag_nobg_l3bu8dlpz8.png?token=	{"order": 3, "textColor": "#fe9526", "underConstruction": false}	t	2025-10-10 11:08:43.066+00	2025-10-29 19:23:18.390594+00
2	ivme	İVME - Aselsan	İVME - Aselsan	Tedarik zincirini uçtan uca takip imkanı sağlıyoruz. Geleceğini öngören, bugünü yöneten üretim ağı.	postgresql	{"host": "localhost", "port": 5435, "user": "postgres", "database": "ivmedb", "password": "postgres", "connection_string": "clickhouse://user:pass@host:port/db"}	http://localhost:8090/api/files/b16hvq5kz10hyii/um632b456r6e84t/miras_ag_nobg_yq78k2fbip.png?token=	{"order": 1, "features": [{"url": "/ivme/verimlilik", "icon": "Activity", "title": "", "imageUrl": "http://localhost:8090/api/files/b16hvq5kz10hyii/dl4f3d9t43t9615/ver_ml_l_k_88f0al82fm.png?token=", "useImage": true, "iconColor": "#3B82F6", "description": "", "backgroundColor": "#EFF6FF"}, {"url": "/ivme/kapasite", "icon": "Activity", "title": "", "imageUrl": "http://localhost:8090/api/files/b16hvq5kz10hyii/3l5e399kao2y343/kapas_te_tov3oa86j0.png?token=", "useImage": true, "iconColor": "#3B82F6", "description": "", "backgroundColor": "#EFF6FF"}, {"url": "", "icon": "Activity", "title": "", "imageUrl": "http://localhost:8090/api/files/b16hvq5kz10hyii/z6larj011i320tf/d_j_tal_olgunluk_u05zpiq3ib.png?token=", "useImage": true, "iconColor": "#3B82F6", "description": "Özellik açıklaması", "backgroundColor": "#EFF6FF"}, {"url": "", "icon": "Activity", "title": "", "imageUrl": "http://localhost:8090/api/files/b16hvq5kz10hyii/f6296s44u0j57gs/alt_yapi_virkia2cgy.png?token=", "useImage": true, "iconColor": "#3B82F6", "description": "", "backgroundColor": "#EFF6FF"}, {"url": "", "icon": "Activity", "title": "", "imageUrl": "http://localhost:8090/api/files/b16hvq5kz10hyii/pi5601b18of80g9/dar_surecler_ofqov5ca9f.png?token=", "useImage": true, "iconColor": "#3B82F6", "description": "", "backgroundColor": "#EFF6FF"}], "leftLogo": "", "textColor": "#469a9c", "headerColor": "#e30613"}	t	2025-10-10 11:08:43.066+00	2025-10-22 13:54:59.672022+00
\.


--
-- Data for Name: report_queries; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.report_queries (id, report_id, name, sql, visualization_config, order_index, created_at, updated_at) FROM stdin;
182	22	Sorgu 2	SELECT "id", "name", "age", "department"\nFROM (\n    VALUES\n        (1, 'Alice', 25, 'Mühendis'),\n        (2, 'Bob', 30, 'Teknisyen'),\n        (3, 'Charlie', 22, 'Mühendis'),\n        (4, 'Diana', 28, 'Teknisyen'),\n        (5, 'Ethan', 35, 'Mühendis'),\n        (6, 'David', 23, 'Mühendis'),\n        (7, 'John', 28, 'Mühendis'),\n        (8, 'Matt', 30, 'Mühendis')\n) AS t(id, name, age, department)\nWHERE 1=1\n{{dynamic_filters}}	{"type": "line", "title": "Sorgu 2 Grafiği", "colors": ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"], "x_axis": "name", "y_axis": "age", "group_by": null, "label_field": null, "show_legend": true, "value_field": null, "chart_options": {"smooth": false, "stacked": false, "bin_count": 10, "clickable": false, "show_dots": true, "show_grid": true, "size_field": null, "inner_radius": 0, "nested_queries": [], "tooltip_fields": [], "show_percentage": true, "show_data_labels": false, "field_display_names": {}}}	0	2025-11-05 12:50:06.167632+00	\N
183	22	Sorgu 1	SELECT "id", "name", "age", "department", "parent_name"\nFROM (\n    VALUES\n        (1, 'Alice', 25, 'Mühendis', 'Bob'),\n        (2, 'Bob', 30, 'Teknisyen', 'Charlie'),\n        (3, 'Charlie', 22, 'Mühendis', 'Alice'),\n        (4, 'Diana', 28, 'Teknisyen', 'Charlie'),\n        (5, 'Ethan', 35, 'Mühendis', 'Alice'),\n        (6, 'David', 23, 'Mühendis', 'Diana'),\n        (7, 'John', 28, 'Mühendis', 'Diana'),\n        (8, 'Matt', 30, 'Mühendis', 'Matt')\n) AS t(id, name, age, department, parent_name)\nWHERE 1=1\n{{dynamic_filters}}	{"type": "expandable", "title": "Sorgu 1 Grafiği", "colors": ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"], "x_axis": "name", "y_axis": "age", "group_by": null, "label_field": null, "show_legend": true, "value_field": null, "chart_options": {"smooth": false, "stacked": false, "bin_count": 10, "clickable": true, "show_dots": true, "show_grid": true, "size_field": null, "inner_radius": 0, "nested_queries": [{"id": "k9i2oef0x", "sql": "SELECT \\"id\\", \\"name\\", \\"age\\", \\"department\\", \\"parent_name\\"\\nFROM (\\n    VALUES\\n        (1, 'Alice', 25, 'Mühendis', 'Bob'),\\n        (2, 'Bob', 30, 'Teknisyen', 'Charlie'),\\n        (3, 'Charlie', 22, 'Mühendis', 'Alice'),\\n        (4, 'Diana', 28, 'Teknisyen', 'Charlie'),\\n        (5, 'Ethan', 35, 'Mühendis', 'Alice'),\\n        (6, 'David', 23, 'Mühendis', 'Diana'),\\n        (7, 'John', 28, 'Mühendis', 'Diana'),\\n        (8, 'Matt', 30, 'Mühendis', 'Matt')\\n) AS t(id, name, age, department, parent_name)", "xAxis": "name", "yAxis": "age", "filters": [{"id": "41adcg6q7", "type": "number", "required": false, "fieldName": "id", "displayName": "id"}, {"id": "k745b6oxk", "type": "multiselect", "required": false, "fieldName": "name", "displayName": "name", "dropdownQuery": "SELECT \\"name\\" as \\"value\\", \\"name\\" as \\"label\\"\\nFROM (\\n    VALUES\\n        (1, 'Alice', 25, 'Mühendis', 'Bob'),\\n        (2, 'Bob', 30, 'Teknisyen', 'Charlie'),\\n        (3, 'Charlie', 22, 'Mühendis', 'Alice'),\\n        (4, 'Diana', 28, 'Teknisyen', 'Charlie'),\\n        (5, 'Ethan', 35, 'Mühendis', 'Alice'),\\n        (6, 'David', 23, 'Mühendis', 'Diana'),\\n        (7, 'John', 28, 'Mühendis', 'Diana'),\\n        (8, 'Matt', 30, 'Mühendis', 'Matt')\\n) AS t(id, name, age)"}, {"id": "q1526ti5w", "type": "multiselect", "required": false, "dependsOn": "name", "fieldName": "parent_name", "displayName": "parent_name", "dropdownQuery": "SELECT \\"parent_name\\" as \\"value\\", \\"parent_name\\" as \\"label\\"\\nFROM (\\n    VALUES\\n        (1, 'Alice', 25, 'Mühendis', 'Bob'),\\n        (2, 'Bob', 30, 'Teknisyen', 'Charlie'),\\n        (3, 'Charlie', 22, 'Mühendis', 'Alice'),\\n        (4, 'Diana', 28, 'Teknisyen', 'Charlie'),\\n        (5, 'Ethan', 35, 'Mühendis', 'Alice'),\\n        (6, 'David', 23, 'Mühendis', 'Diana'),\\n        (7, 'John', 28, 'Mühendis', 'Diana'),\\n        (8, 'Matt', 30, 'Mühendis', 'Matt')\\n) AS t(id, name, age, department, parent_name)\\nWHERE \\"name\\" IN {{name}}"}], "labelField": "name", "valueField": "age", "expandableFields": [], "visualizationType": "bar"}], "tooltip_fields": [], "show_percentage": true, "show_data_labels": false, "field_display_names": {}}}	0	2025-11-05 12:50:06.167632+00	\N
184	22	Sorgu 3	SELECT "id", "name", "age", "department", "parent_name", "plan_date"\nFROM (\n    VALUES\n        (1, 'Alice', 25, 'Mühendis', 'Bob', '2025-10-05 12:00:44.000'),\n        (2, 'Bob', 30, 'Teknisyen', 'Charlie', '2025-11-05 12:00:44.000'),\n        (3, 'Charlie', 22, 'Mühendis', 'Alice', '2025-09-07 12:00:44.000'),\n        (4, 'Diana', 28, 'Teknisyen', 'Charlie', '2025-10-13 12:00:44.000'),\n        (5, 'Ethan', 35, 'Mühendis', 'Alice', '2025-10-08 12:00:44.000')\n) AS t(id, name, age, department, parent_name, plan_date)\nWHERE 1=1\n{{dynamic_filters}}	{"type": "line", "title": "Sorgu 3 Grafiği", "colors": ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"], "x_axis": "plan_date", "y_axis": "age", "group_by": null, "label_field": null, "show_legend": true, "value_field": null, "chart_options": {"smooth": false, "stacked": false, "bin_count": 10, "clickable": false, "show_dots": true, "show_grid": true, "size_field": null, "inner_radius": 0, "nested_queries": [], "tooltip_fields": [], "show_percentage": true, "show_data_labels": false, "field_display_names": {}}}	0	2025-11-05 12:50:06.167632+00	\N
4	4	Sorgu 1	SELECT\n    p.TPAdimID,\n    tu.StokNo,\n    teu.SeriNo,\n    t.TestAdi,\n    p.TestDurum,\n    p.OlcumYeri,\n    ta.OlculenDeger,\n    p.AltLimit,\n    p.UstLimit,\n    ta.TestAdimiGectiKaldi,\n    p.VeriTipi,\n    t.TestBaslangicTarihi\nFROM REHIS_TestKayit_Test_TabloTest t\nLEFT JOIN REHIS_TestKayit_Test_TabloTestAdimi ta\n    ON ta.TestID = t.TestID\nLEFT JOIN REHIS_TestTanim_Test_TabloTestPlan p\n    ON p.TPAdimID = ta.TPAdimID\nLEFT JOIN REHIS_TestKayit_Test_TabloTestGrup g\n    ON g.TestGrupID = t.TestGrupID\nLEFT JOIN REHIS_TestKayit_Test_TabloTEU teu\n    ON teu.TEUID = g.TEUID\nLEFT JOIN REHIS_TestTanim_Test_TabloUrun tu\n    ON tu.UrunID = teu.UrunID\nLIMIT 50	{"type": "line", "title": "Sorgu 1 Grafiği", "colors": ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"], "x_axis": "StokNo", "y_axis": "OlculenDeger", "group_by": null, "label_field": null, "show_legend": true, "value_field": null, "chart_options": {"smooth": false, "stacked": false, "bin_count": 10, "show_dots": true, "show_grid": true, "size_field": null, "inner_radius": 0, "tooltip_fields": [], "show_percentage": true, "show_data_labels": false, "field_display_names": {}}}	0	2025-09-25 06:00:10.419345+00	\N
33	5	Sorgu 1	SELECT\n    p.TPAdimID,\n    tu.StokNo,\n    teu.SeriNo,\n    t.TestAdi,\n    p.TestDurum,\n    p.OlcumYeri,\n    ta.OlculenDeger,\n    p.AltLimit,\n    p.UstLimit,\n    ta.TestAdimiGectiKaldi,\n    p.VeriTipi,\n    t.TestBaslangicTarihi\nFROM REHIS_TestKayit_Test_TabloTest t\nLEFT JOIN REHIS_TestKayit_Test_TabloTestAdimi ta\n    ON ta.TestID = t.TestID\nLEFT JOIN REHIS_TestTanim_Test_TabloTestPlan p\n    ON p.TPAdimID = ta.TPAdimID\nLEFT JOIN REHIS_TestKayit_Test_TabloTestGrup g\n    ON g.TestGrupID = t.TestGrupID\nLEFT JOIN REHIS_TestKayit_Test_TabloTEU teu\n    ON teu.TEUID = g.TEUID\nLEFT JOIN REHIS_TestTanim_Test_TabloUrun tu\n    ON tu.UrunID = teu.UrunID\nWHERE 1=1\n{{dynamic_filters}}\nLIMIT 50	{"type": "pie", "title": "Sorgu 1 Grafiği", "colors": ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"], "x_axis": null, "y_axis": null, "group_by": null, "label_field": "StokNo", "show_legend": true, "value_field": "OlculenDeger", "chart_options": {"smooth": false, "stacked": false, "bin_count": 10, "show_dots": true, "show_grid": true, "size_field": null, "inner_radius": 0, "tooltip_fields": [], "show_percentage": true, "show_data_labels": false, "field_display_names": {}}}	0	2025-09-29 10:11:13.442952+00	\N
34	6	Sorgu 1	SELECT DISTINCT (teu.SeriNo)\n            FROM REHIS_TestTanim_Test_TabloUrun u\n            LEFT JOIN REHIS_TestKayit_Test_TabloTEU teu ON teu.UrunID = u.UrunID\n            LEFT JOIN REHIS_TestKayit_Test_TabloTestGrup g ON g.TEUID = teu.TEUID\n            LEFT JOIN default.REHIS_TestTanim_Test_TabloPersonel p on g.PersonelID = p.PersonelID\n            WHERE u.UrunID = 1 AND upper(p.Firma) = 'ASELSAN'\n            ORDER BY teu.TEUID	{"type": "table", "title": "Sorgu 1 Grafiği", "colors": ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"], "x_axis": null, "y_axis": null, "group_by": null, "label_field": null, "show_legend": true, "value_field": null, "chart_options": {"smooth": false, "stacked": false, "bin_count": 10, "show_dots": true, "show_grid": true, "size_field": null, "inner_radius": 0, "tooltip_fields": [], "show_percentage": true, "show_data_labels": false, "field_display_names": {}}}	0	2025-10-06 06:01:37.284024+00	\N
35	7	Sorgu 1	SELECT DISTINCT (teu.SeriNo)\n            FROM REHIS_TestTanim_Test_TabloUrun u\n            LEFT JOIN REHIS_TestKayit_Test_TabloTEU teu ON teu.UrunID = u.UrunID\n            LEFT JOIN REHIS_TestKayit_Test_TabloTestGrup g ON g.TEUID = teu.TEUID\n            LEFT JOIN default.REHIS_TestTanim_Test_TabloPersonel p on g.PersonelID = p.PersonelID\n            WHERE u.UrunID = 1 AND upper(p.Firma) = 'ASELSAN'\n            ORDER BY teu.TEUID	{"type": "table", "title": "Sorgu 1 Grafiği", "colors": ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"], "x_axis": null, "y_axis": null, "group_by": null, "label_field": null, "show_legend": true, "value_field": null, "chart_options": {"smooth": false, "stacked": false, "bin_count": 10, "show_dots": true, "show_grid": true, "size_field": null, "inner_radius": 0, "tooltip_fields": [], "show_percentage": true, "show_data_labels": false, "field_display_names": {}}}	0	2025-10-06 06:05:25.425862+00	\N
36	8	Sorgu 1	SELECT DISTINCT (teu.SeriNo)\n            FROM REHIS_TestTanim_Test_TabloUrun u\n            LEFT JOIN REHIS_TestKayit_Test_TabloTEU teu ON teu.UrunID = u.UrunID\n            LEFT JOIN REHIS_TestKayit_Test_TabloTestGrup g ON g.TEUID = teu.TEUID\n            LEFT JOIN default.REHIS_TestTanim_Test_TabloPersonel p on g.PersonelID = p.PersonelID\n            WHERE u.UrunID = 1 AND upper(p.Firma) = 'ASELSAN'\n            ORDER BY teu.TEUID	{"type": "table", "title": "Sorgu 1 Grafiği", "colors": ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"], "x_axis": null, "y_axis": null, "group_by": null, "label_field": null, "show_legend": true, "value_field": null, "chart_options": {"smooth": false, "stacked": false, "bin_count": 10, "show_dots": true, "show_grid": true, "size_field": null, "inner_radius": 0, "tooltip_fields": [], "show_percentage": true, "show_data_labels": false, "field_display_names": {}}}	0	2025-10-06 06:08:25.614881+00	\N
38	9	Sorgu 1	SELECT DISTINCT (teu.SeriNo)\n            FROM REHIS_TestTanim_Test_TabloUrun u\n            LEFT JOIN REHIS_TestKayit_Test_TabloTEU teu ON teu.UrunID = u.UrunID\n            LEFT JOIN REHIS_TestKayit_Test_TabloTestGrup g ON g.TEUID = teu.TEUID\n            LEFT JOIN default.REHIS_TestTanim_Test_TabloPersonel p on g.PersonelID = p.PersonelID\n            WHERE u.UrunID = 1 AND upper(p.Firma) = 'ASELSAN'\n            ORDER BY teu.TEUID	{"type": "pareto", "title": "Sorgu 1 Grafiği", "colors": ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"], "x_axis": null, "y_axis": null, "group_by": null, "label_field": null, "show_legend": true, "value_field": null, "chart_options": {"smooth": false, "stacked": false, "bin_count": 10, "show_dots": true, "show_grid": true, "size_field": null, "inner_radius": 0, "tooltip_fields": [], "show_percentage": true, "show_data_labels": false, "field_display_names": {}}}	0	2025-10-06 06:16:23.531055+00	\N
40	3	Tablo Görünümü	SELECT\n    p.TPAdimID,\n    tu.StokNo,\n    teu.SeriNo,\n    t.TestAdi,\n    p.TestDurum,\n    p.OlcumYeri,\n    ta.OlculenDeger,\n    p.AltLimit,\n    p.UstLimit,\n    ta.TestAdimiGectiKaldi,\n    p.VeriTipi,\n    t.TestBaslangicTarihi\nFROM REHIS_TestKayit_Test_TabloTest t\nLEFT JOIN REHIS_TestKayit_Test_TabloTestAdimi ta\n    ON ta.TestID = t.TestID\nLEFT JOIN REHIS_TestTanim_Test_TabloTestPlan p\n    ON p.TPAdimID = ta.TPAdimID\nLEFT JOIN REHIS_TestKayit_Test_TabloTestGrup g\n    ON g.TestGrupID = t.TestGrupID\nLEFT JOIN REHIS_TestKayit_Test_TabloTEU teu\n    ON teu.TEUID = g.TEUID\nLEFT JOIN REHIS_TestTanim_Test_TabloUrun tu\n    ON tu.UrunID = teu.UrunID\nWHERE 1=1\n{{dynamic_filters}}	{"type": "table", "title": "Sorgu 1 Grafiği", "colors": ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"], "x_axis": null, "y_axis": null, "group_by": null, "label_field": null, "show_legend": true, "value_field": null, "chart_options": {"smooth": false, "stacked": false, "bin_count": 10, "show_dots": true, "show_grid": true, "size_field": null, "inner_radius": 0, "tooltip_fields": [], "show_percentage": true, "show_data_labels": false, "field_display_names": {}}}	0	2025-10-07 10:46:00.493129+00	\N
41	3	Line Chart	SELECT\n    p.TPAdimID,\n    tu.StokNo,\n    teu.SeriNo,\n    t.TestAdi,\n    p.TestDurum,\n    p.OlcumYeri,\n    ta.OlculenDeger,\n    p.AltLimit,\n    p.UstLimit,\n    ta.TestAdimiGectiKaldi,\n    p.VeriTipi,\n    t.TestBaslangicTarihi\nFROM REHIS_TestKayit_Test_TabloTest t\nLEFT JOIN REHIS_TestKayit_Test_TabloTestAdimi ta\n    ON ta.TestID = t.TestID\nLEFT JOIN REHIS_TestTanim_Test_TabloTestPlan p\n    ON p.TPAdimID = ta.TPAdimID\nLEFT JOIN REHIS_TestKayit_Test_TabloTestGrup g\n    ON g.TestGrupID = t.TestGrupID\nLEFT JOIN REHIS_TestKayit_Test_TabloTEU teu\n    ON teu.TEUID = g.TEUID\nLEFT JOIN REHIS_TestTanim_Test_TabloUrun tu\n    ON tu.UrunID = teu.UrunID\nWHERE 1=1\n{{dynamic_filters}}\nLIMIT 50	{"type": "line", "title": "Sorgu 2 Grafiği", "colors": ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"], "x_axis": "SeriNo", "y_axis": "OlculenDeger", "group_by": null, "label_field": null, "show_legend": true, "value_field": null, "chart_options": {"smooth": false, "stacked": false, "bin_count": 10, "show_dots": true, "show_grid": true, "size_field": null, "inner_radius": 0, "tooltip_fields": [], "show_percentage": true, "show_data_labels": false, "field_display_names": {}}}	0	2025-10-07 10:46:00.493129+00	\N
64	19	Sorgu 1	SELECT	{"type": "table", "title": "Sorgu 1 Grafiği", "colors": ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"], "x_axis": null, "y_axis": null, "group_by": null, "label_field": null, "show_legend": true, "value_field": null, "chart_options": {"smooth": false, "stacked": false, "bin_count": 10, "show_dots": true, "show_grid": true, "size_field": null, "inner_radius": 0, "nested_queries": [], "tooltip_fields": [], "show_percentage": true, "show_data_labels": false, "field_display_names": {}}}	0	2025-10-21 11:21:55.014504+00	\N
78	21	Sorgu 1	SELECT "Firma", "TezgahNo", count(*) as "Toplam" FROM mes_production.get_detailed_machines WHERE 1=1 {{dynamic_filters}}\nGROUP BY "Firma", "TezgahNo"	{"type": "table", "title": "Sorgu 1 Grafiği", "colors": ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"], "x_axis": "Firma", "y_axis": "Toplam", "group_by": null, "label_field": null, "show_legend": true, "value_field": null, "chart_options": {"smooth": false, "stacked": false, "bin_count": 10, "show_dots": true, "show_grid": true, "size_field": null, "inner_radius": 0, "nested_queries": [], "tooltip_fields": [], "show_percentage": true, "show_data_labels": false, "field_display_names": {}}}	0	2025-11-03 11:43:53.154346+00	\N
87	14	Sorgu 1	SELECT "NAME" as "Name", "Planlanan Başlangıç Tarihi" FROM mes_production.test_nested_level_one	{"type": "expandable", "title": "Sorgu 1 Grafiği", "colors": ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"], "x_axis": null, "y_axis": null, "group_by": null, "label_field": null, "show_legend": true, "value_field": null, "chart_options": {"smooth": false, "stacked": false, "bin_count": 10, "clickable": false, "show_dots": true, "show_grid": true, "size_field": null, "inner_radius": 0, "nested_queries": [{"id": "617nc9ein", "sql": "SELECT \\"Parent Name\\", \\"Planlanan Başlangıç Tarihi\\" FROM mes_production.test_nested_level_two WHERE \\"Parent Name\\" = {{Name}}", "filters": [{"id": "pyi0yg4f3", "type": "date", "required": false, "fieldName": "Planlanan Başlangıç Tarihi", "displayName": "Planlanan Başlangıç Tarihi"}, {"id": "etfixrh5t", "type": "multiselect", "required": false, "fieldName": "Parent Name", "displayName": "Parent Name"}], "nestedQueries": [], "expandableFields": ["id", "Name"]}], "tooltip_fields": [], "show_percentage": true, "show_data_labels": false, "field_display_names": {}}}	0	2025-11-04 10:22:35.136381+00	\N
\.


--
-- Data for Name: report_query_filters; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.report_query_filters (id, query_id, field_name, display_name, filter_type, dropdown_query, required, created_at, updated_at, sql_expression, depends_on) FROM stdin;
37	33	TestBaslangicTarihi	TestBaslangicTarihi	date	\N	f	2025-09-29 10:11:13.442952+00	\N	\N	\N
38	40	TestBaslangicTarihi	TestBaslangicTarihi	date	\N	f	2025-10-07 10:46:00.493129+00	\N	\N	\N
39	40	StokNo	Stok No	text	\N	f	2025-10-07 10:46:00.493129+00	\N	\N	\N
40	40	TestDurum	TestDurum	multiselect	SELECT distinct(TestDurum) as value, value as label FROM REHIS_TestTanim_Test_TabloTestPlan	f	2025-10-07 10:46:00.493129+00	\N	\N	\N
41	41	StokNo	StokNo	dropdown	SELECT distinct(StokNo) as value, value as label FROM REHIS_TestTanim_Test_TabloUrun	f	2025-10-07 10:46:00.493129+00	\N	\N	\N
66	78	Firma	Firma	text	\N	f	2025-11-03 11:43:53.154346+00	\N	\N	\N
67	78	TezgahNo	TezgahNo	text	\N	f	2025-11-03 11:43:53.154346+00	\N	\N	\N
68	78	Toplam	Toplam	text	\N	f	2025-11-03 11:43:53.154346+00	\N	\N	\N
69	87	Planlanan Başlangıç Tarihi	Planlanan Başlangıç Tarihi	date	\N	f	2025-11-04 10:22:35.136381+00	\N	TO_DATE(SPLIT_PART("Planlanan Başlangıç Tarihi", ' ', 1), 'YYYY-MM-DD')	\N
297	182	name	name	multiselect	SELECT "name" as "value", "name" as "label"\nFROM (\n    VALUES\n        (1, 'Alice', 25),\n        (2, 'Bob', 30),\n        (3, 'Charlie', 22),\n        (4, 'Diana', 28),\n        (5, 'Ethan', 35)\n) AS t(id, name, age)	f	2025-11-05 12:50:06.167632+00	\N	\N	\N
298	183	id	id	number	\N	f	2025-11-05 12:50:06.167632+00	\N	\N	\N
299	183	name	name	multiselect	SELECT "name" as "value", "name" as "label"\nFROM (\n    VALUES\n        (1, 'Alice', 25, 'Mühendis', 'Bob'),\n        (2, 'Bob', 30, 'Teknisyen', 'Charlie'),\n        (3, 'Charlie', 22, 'Mühendis', 'Alice'),\n        (4, 'Diana', 28, 'Teknisyen', 'Charlie'),\n        (5, 'Ethan', 35, 'Mühendis', 'Alice'),\n        (6, 'David', 23, 'Mühendis', 'Diana'),\n        (7, 'John', 28, 'Mühendis', 'Diana'),\n        (8, 'Matt', 30, 'Mühendis', 'Matt')\n) AS t(id, name, age)	f	2025-11-05 12:50:06.167632+00	\N	\N	\N
300	183	age	age	text	\N	f	2025-11-05 12:50:06.167632+00	\N	\N	\N
301	183	department	department	text	\N	f	2025-11-05 12:50:06.167632+00	\N	\N	\N
302	183	parent_name	parent_name	multiselect	SELECT "parent_name" as "value", "parent_name" as "label"\nFROM (\n    VALUES\n        (1, 'Alice', 25, 'Mühendis', 'Bob'),\n        (2, 'Bob', 30, 'Teknisyen', 'Charlie'),\n        (3, 'Charlie', 22, 'Mühendis', 'Alice'),\n        (4, 'Diana', 28, 'Teknisyen', 'Charlie'),\n        (5, 'Ethan', 35, 'Mühendis', 'Alice'),\n        (6, 'David', 23, 'Mühendis', 'Diana'),\n        (7, 'John', 28, 'Mühendis', 'Diana'),\n        (8, 'Matt', 30, 'Mühendis', 'Matt')\n) AS t(id, name, age, department, parent_name)\nWHERE "name" IN {{name}}	f	2025-11-05 12:50:06.167632+00	\N	\N	name
303	184	plan_date	plan_date	date	\N	f	2025-11-05 12:50:06.167632+00	\N	TO_DATE(SPLIT_PART("plan_date", ' ', 1), 'YYYY-MM-DD')	\N
\.


--
-- Data for Name: reports; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reports (id, name, description, owner_id, is_public, tags, created_at, updated_at, platform_id) FROM stdin;
4	Çizgi Raporu		2	f	{}	2025-09-25 06:00:10.419345+00	\N	1
6	Testt	asdasd	2	f	{}	2025-10-06 06:01:37.284024+00	\N	1
9	asdasd	sadasd	2	f	{}	2025-10-06 06:11:20.387852+00	\N	1
5	Test Raporu		2	f	{}	2025-09-26 06:48:04.830807+00	\N	1
7	Test report	sadsd	2	f	{}	2025-10-06 06:05:25.425862+00	\N	1
3	Test report	Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. 	2	f	{}	2025-09-24 10:41:54.503937+00	2025-09-25 10:05:32.287932+00	1
8	testt	saddas	2	f	{}	2025-10-06 06:08:25.614881+00	\N	1
14	Nested		2	f	{verimlilik}	2025-10-20 10:35:00.973748+00	\N	2
19	aa	aa	2	f	{kapasite}	2025-10-21 11:21:31.45444+00	\N	2
21	testtt		2	f	{kapasite}	2025-10-31 12:24:19.896311+00	\N	2
22	clickable bar plot		2	f	{}	2025-11-04 06:54:19.967269+00	\N	2
\.


--
-- Data for Name: user_platforms; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_platforms (id, user_id, platform_id, role, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, username, created_at, updated_at, name) FROM stdin;
1	berkyurttas	2025-09-03 10:09:06.704+00	2025-09-03 10:09:09.396+00	\N
3	yeisikdemir	2025-09-25 11:50:41.729533+00	\N	\N
2	gcabbar	2025-09-12 08:08:53.17343+00	2025-10-06 06:24:28.346054+00	Soner Gökberk CABBAR
\.


--
-- Name: dashboard_users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.dashboard_users_id_seq', 22, true);


--
-- Name: dashboards_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.dashboards_id_seq', 31, true);


--
-- Name: platforms_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.platforms_id_seq', 1, true);


--
-- Name: report_queries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.report_queries_id_seq', 184, true);


--
-- Name: report_query_filters_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.report_query_filters_id_seq', 303, true);


--
-- Name: reports_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.reports_id_seq', 22, true);


--
-- Name: user_platforms_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.user_platforms_id_seq', 1, false);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 3, true);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: dashboard_users dashboard_users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dashboard_users
    ADD CONSTRAINT dashboard_users_pkey PRIMARY KEY (id);


--
-- Name: dashboards dashboards_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dashboards
    ADD CONSTRAINT dashboards_pkey PRIMARY KEY (id);


--
-- Name: platforms platforms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platforms
    ADD CONSTRAINT platforms_pkey PRIMARY KEY (id);


--
-- Name: report_queries report_queries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_queries
    ADD CONSTRAINT report_queries_pkey PRIMARY KEY (id);


--
-- Name: report_query_filters report_query_filters_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_query_filters
    ADD CONSTRAINT report_query_filters_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: user_platforms user_platforms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_platforms
    ADD CONSTRAINT user_platforms_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: ix_dashboard_users_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_dashboard_users_id ON public.dashboard_users USING btree (id);


--
-- Name: ix_dashboards_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_dashboards_id ON public.dashboards USING btree (id);


--
-- Name: ix_dashboards_platform_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_dashboards_platform_id ON public.dashboards USING btree (platform_id);


--
-- Name: ix_platforms_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ix_platforms_code ON public.platforms USING btree (code);


--
-- Name: ix_platforms_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_platforms_id ON public.platforms USING btree (id);


--
-- Name: ix_report_queries_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_report_queries_id ON public.report_queries USING btree (id);


--
-- Name: ix_report_query_filters_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_report_query_filters_id ON public.report_query_filters USING btree (id);


--
-- Name: ix_reports_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_reports_id ON public.reports USING btree (id);


--
-- Name: ix_reports_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_reports_name ON public.reports USING btree (name);


--
-- Name: ix_reports_platform_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_reports_platform_id ON public.reports USING btree (platform_id);


--
-- Name: ix_user_platforms_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_user_platforms_id ON public.user_platforms USING btree (id);


--
-- Name: ix_user_platforms_platform_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_user_platforms_platform_id ON public.user_platforms USING btree (platform_id);


--
-- Name: ix_user_platforms_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_user_platforms_user_id ON public.user_platforms USING btree (user_id);


--
-- Name: ix_users_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_users_id ON public.users USING btree (id);


--
-- Name: ix_users_username; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ix_users_username ON public.users USING btree (username);


--
-- Name: dashboard_users dashboard_users_dashboard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dashboard_users
    ADD CONSTRAINT dashboard_users_dashboard_id_fkey FOREIGN KEY (dashboard_id) REFERENCES public.dashboards(id);


--
-- Name: dashboard_users dashboard_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dashboard_users
    ADD CONSTRAINT dashboard_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: dashboards dashboards_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dashboards
    ADD CONSTRAINT dashboards_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- Name: dashboards dashboards_platform_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dashboards
    ADD CONSTRAINT dashboards_platform_id_fkey FOREIGN KEY (platform_id) REFERENCES public.platforms(id);


--
-- Name: report_queries report_queries_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_queries
    ADD CONSTRAINT report_queries_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.reports(id);


--
-- Name: report_query_filters report_query_filters_query_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_query_filters
    ADD CONSTRAINT report_query_filters_query_id_fkey FOREIGN KEY (query_id) REFERENCES public.report_queries(id);


--
-- Name: reports reports_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- Name: reports reports_platform_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_platform_id_fkey FOREIGN KEY (platform_id) REFERENCES public.platforms(id);


--
-- Name: user_platforms user_platforms_platform_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_platforms
    ADD CONSTRAINT user_platforms_platform_id_fkey FOREIGN KEY (platform_id) REFERENCES public.platforms(id);


--
-- Name: user_platforms user_platforms_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_platforms
    ADD CONSTRAINT user_platforms_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict tCOjODLxDPXiPqcdKvR34CfbvqxKyP2wFQBCHjdxxMhuE3Gqxl1eyem2BslFjr8

