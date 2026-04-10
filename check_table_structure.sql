-- Check if tables exist and their structure
-- Run this in your aflow_db database

-- Check if step_definitions table exists
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'step_definitions'
ORDER BY ordinal_position;

-- Check if job_step_instances table exists  
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'job_step_instances'
ORDER BY ordinal_position;

-- Check sample data from step_definitions
SELECT * FROM step_definitions LIMIT 5;

-- Check sample data from job_step_instances for 'test' job
SELECT * FROM job_step_instances WHERE job_instance_id = 'test' LIMIT 5;

-- Check if there's any data with 'Onayı' in the name
SELECT sd.*, si.job_instance_id, si.status 
FROM step_definitions sd
LEFT JOIN job_step_instances si ON sd.id = si.step_definition_id
WHERE sd.name LIKE '%Onayı%'
LIMIT 10;
