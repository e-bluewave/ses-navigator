-- SES Navigator
-- Local development seed data.
-- This file contains synthetic data only. Do not add production data or secrets.

begin;

-- Stable UUIDs keep this seed idempotent and make fixtures easy to reference.
insert into app.tenants (
  id,
  code,
  name,
  status,
  settings
)
values (
  '10000000-0000-4000-8000-000000000001',
  'demo',
  'SES Navigator Demo',
  'active',
  '{"seed_data": true, "locale": "ja-JP"}'::jsonb
)
on conflict (id) do update
set
  code = excluded.code,
  name = excluded.name,
  status = excluded.status,
  settings = excluded.settings;

insert into app.organizations (
  id,
  tenant_id,
  parent_id,
  code,
  name,
  organization_type,
  is_active
)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  null,
  'demo-head-office',
  'デモ本社',
  'company',
  true
)
on conflict (id) do update
set
  tenant_id = excluded.tenant_id,
  parent_id = excluded.parent_id,
  code = excluded.code,
  name = excluded.name,
  organization_type = excluded.organization_type,
  is_active = excluded.is_active;

insert into app.organizations (
  id,
  tenant_id,
  parent_id,
  code,
  name,
  organization_type,
  is_active
)
values (
  '20000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'demo-sales',
  'SES営業部',
  'department',
  true
)
on conflict (id) do update
set
  tenant_id = excluded.tenant_id,
  parent_id = excluded.parent_id,
  code = excluded.code,
  name = excluded.name,
  organization_type = excluded.organization_type,
  is_active = excluded.is_active;

insert into app.companies (
  id,
  tenant_id,
  management_no,
  legal_name,
  legal_name_normalized,
  display_name,
  prefecture,
  city,
  website_url,
  status,
  risk_level
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'DEMO-COMP-001',
    'デモソリューション株式会社',
    'デモソリューション株式会社',
    'デモソリューション',
    '東京都',
    '千代田区',
    'https://example.com/customer',
    'active',
    'none'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'DEMO-COMP-002',
    'サンプルパートナーズ株式会社',
    'サンプルパートナーズ株式会社',
    'サンプルパートナーズ',
    '東京都',
    '新宿区',
    'https://example.com/partner',
    'active',
    'low'
  )
on conflict (id) do update
set
  tenant_id = excluded.tenant_id,
  management_no = excluded.management_no,
  legal_name = excluded.legal_name,
  legal_name_normalized = excluded.legal_name_normalized,
  display_name = excluded.display_name,
  prefecture = excluded.prefecture,
  city = excluded.city,
  website_url = excluded.website_url,
  status = excluded.status,
  risk_level = excluded.risk_level;

insert into app.engineers (
  id,
  tenant_id,
  management_no,
  family_name,
  given_name,
  family_name_kana,
  given_name_kana,
  display_name,
  name_normalized,
  status,
  availability_status,
  available_from,
  nearest_station,
  summary
)
values
  (
    '40000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'DEMO-ENG-001',
    '山田',
    '太郎',
    'ヤマダ',
    'タロウ',
    '山田 太郎',
    '山田太郎',
    'active',
    'available',
    current_date,
    '東京駅',
    'Java・Spring Bootを中心とするバックエンドエンジニア'
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'DEMO-ENG-002',
    '佐藤',
    '花子',
    'サトウ',
    'ハナコ',
    '佐藤 花子',
    '佐藤花子',
    'active',
    'available',
    current_date + 14,
    '新宿駅',
    'React・TypeScriptを中心とするフロントエンドエンジニア'
  )
on conflict (id) do update
set
  tenant_id = excluded.tenant_id,
  management_no = excluded.management_no,
  family_name = excluded.family_name,
  given_name = excluded.given_name,
  family_name_kana = excluded.family_name_kana,
  given_name_kana = excluded.given_name_kana,
  display_name = excluded.display_name,
  name_normalized = excluded.name_normalized,
  status = excluded.status,
  availability_status = excluded.availability_status,
  available_from = excluded.available_from,
  nearest_station = excluded.nearest_station,
  summary = excluded.summary;

insert into app.projects (
  id,
  tenant_id,
  management_no,
  project_name,
  project_name_normalized,
  summary,
  project_status,
  recruitment_status,
  primary_customer_company_id,
  planned_start_on,
  planned_end_on,
  received_at
)
values
  (
    '50000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'DEMO-PRJ-001',
    '販売管理システム刷新',
    '販売管理システム刷新',
    'Java・Spring Bootによる基幹システム刷新案件',
    'open',
    'recruiting',
    '30000000-0000-4000-8000-000000000001',
    current_date + 30,
    current_date + 210,
    now()
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'DEMO-PRJ-002',
    '営業支援Webアプリ開発',
    '営業支援Webアプリ開発',
    'React・TypeScriptを用いた新規Webアプリ開発案件',
    'open',
    'recruiting',
    '30000000-0000-4000-8000-000000000002',
    current_date + 45,
    current_date + 165,
    now()
  )
on conflict (id) do update
set
  tenant_id = excluded.tenant_id,
  management_no = excluded.management_no,
  project_name = excluded.project_name,
  project_name_normalized = excluded.project_name_normalized,
  summary = excluded.summary,
  project_status = excluded.project_status,
  recruitment_status = excluded.recruitment_status,
  primary_customer_company_id = excluded.primary_customer_company_id,
  planned_start_on = excluded.planned_start_on,
  planned_end_on = excluded.planned_end_on,
  received_at = excluded.received_at;

commit;
