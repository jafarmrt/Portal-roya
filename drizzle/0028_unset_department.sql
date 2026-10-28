-- «نامشخص» was a placeholder unit and position for AD accounts. A colleague without them now has none,
-- picks them on the first-sign-in form, and staff management lists them under «نیاز به تکمیل».
UPDATE "employees" SET "department" = '' WHERE "department" = 'نامشخص';
--> statement-breakpoint
UPDATE "employees" SET "position" = '' WHERE "position" = 'نامشخص';
--> statement-breakpoint
-- The placeholder leaves the unit list, unless an audience or a guide names it (then it is a real unit
-- an administrator can rename or remove) or it is the only unit there is.
UPDATE "settings" SET "departments" = array_remove("departments", 'نامشخص')
WHERE 'نامشخص' = ANY("departments")
  AND cardinality("departments") > 1
  AND NOT EXISTS (SELECT 1 FROM "news" WHERE 'نامشخص' = ANY("target_departments"))
  AND NOT EXISTS (SELECT 1 FROM "documents" WHERE 'نامشخص' = ANY("target_departments"))
  AND NOT EXISTS (SELECT 1 FROM "polls" WHERE 'نامشخص' = ANY("target_departments"))
  AND NOT EXISTS (SELECT 1 FROM "calendar_events" WHERE 'نامشخص' = ANY("target_departments"))
  AND NOT EXISTS (SELECT 1 FROM "guides" WHERE "department" = 'نامشخص');
--> statement-breakpoint
DELETE FROM "department_pages"
WHERE "department" = 'نامشخص' AND NOT EXISTS (SELECT 1 FROM "settings" WHERE 'نامشخص' = ANY("departments"));
