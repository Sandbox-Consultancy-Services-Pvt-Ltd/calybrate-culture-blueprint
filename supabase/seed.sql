-- Reference data and the default layout. Idempotent: safe to re-run.
begin;

insert into codex.value_groups (code, name, sort_order) values
  ('core-sacrifice', 'Core sacrifice', 1),
  ('how-we-build-trust', 'How we build trust', 2),
  ('how-we-make-decisions', 'How we make decisions', 3),
  ('our-voice-to-the-outside-world', 'Our voice to the outside world', 4)
on conflict (code) do nothing;

insert into codex.core_values (group_id, code, name, statement, description, sort_order)
select g.id, v.code, v.name, v.statement, v.description, v.sort_order from (values
  ('core-sacrifice', 'availability', 'Availability', $q$We are always available$q$, $q$We are a always-on organisation, and the job comes with that. When we're needed, we're there. We don't clock-watch or resent the call, because we know the frontline never stops. We put ourselves in the shoes of the person who needs us, and we're there.$q$, 1),
  ('how-we-build-trust', 'mutual-respect', 'Mutual respect', $q$We give the respect we expect.$q$, $q$Respect isn't about rank. The senior leader, the cleaner, the new hire, the customer — everyone here is owed the same courtesy. We listen before we judge, and we treat people the way we'd want to be treated ourselves. We give respect first, because that's how trust begins.$q$, 2),
  ('how-we-build-trust', 'consistency', 'Consistency', $q$Consistent standards every time.$q$, $q$People trust what they can count on. So we hold the same standard every time — every shift, every customer, every site. We don't cut corners when it's busy or coast when it's quiet. We think of the person counting on us to be as good today as we were yesterday, and we don't let them down.$q$, 3),
  ('how-we-make-decisions', 'customer-first', 'Customer first', $q$We always put the customer first.$q$, $q$Every decision starts with the customer and works back from there. We picture them in the room for every call we make, and we choose what's right for them. Get the customer right, and the rest follows.$q$, 4),
  ('our-voice-to-the-outside-world', 'quality', 'Quality', $q$We deliver quality every time.$q$, $q$Quality is what we're known for, so we guard it in everything we touch. We do it right the first time, and we don't pass on work we wouldn't trust ourselves. There's always a person on the other end — a customer, a colleague, a family — and they deserve our best. Good enough never is.$q$, 5)
) as v(group_code, code, name, statement, description, sort_order)
join codex.value_groups g on g.code = v.group_code
on conflict (code) do nothing;

insert into codex.practices (code, name, summary, sort_order) values
  ('P1', 'OPS Skills Developing Center', 'Level-based (01–05) skills centre for all hires; sets the standard for the organisation.', 1),
  ('P2', 'Competitive Self Development', 'Self-directed learning: self accountability, organisational support and incentive towards advancement.', 2),
  ('P3', 'Metric Driven', 'Outcome-driven reviews: technical review and by-annual review.', 3),
  ('P4', 'Advancement', 'Outcome-based advancement: positions or scope enhancements and recommendations.', 4),
  ('P5', 'Incentive', 'Incentive awarded as a review outcome; linked to development and advancement.', 5),
  ('P6', 'Development', 'Development outcome that feeds incentive and, ultimately, exit.', 6),
  ('P7', 'Feedback Practice', 'Monday Stand-In Meetings: review matrix, team feedback and individual feedback.', 7),
  ('P8', 'Engagement (based on CCT)', 'Performance engagement (celebrate · correct · combat) and team engagement.', 8),
  ('P9', 'Exit', 'Voluntary and non-voluntary exit; triggers tested against CCT, then review → exit.', 9)
on conflict (code) do nothing;

insert into codex.sop_statuses (code, name, sort_order) values ('in-progress', 'In progress', 1), ('done', 'Done', 2)
on conflict (code) do nothing;

insert into codex.sops (sop_number, title, status_id)
select s.n, s.title, st.id from (values
  (1, 'Talent Acquisition & Selection', 'done'), (2, 'Employee Life Cycle (ELC)', 'done'), (3, 'Employee Experience', 'done'),
  (4, 'Employee Career Path Management', 'done'), (5, 'Learning & Development', 'in-progress'), (6, 'Performance Management', 'in-progress'),
  (7, 'Time & Attendance, Leave, Payroll', 'in-progress'), (8, 'Employee Farewell', 'done'), (9, 'Loan Schemes and Salary Advances', 'done'),
  (10, 'Employee Assistance Scheme', 'in-progress'), (11, 'Grievance Handling & Whistle Blowing', 'in-progress'),
  (12, 'New Employee Orientation, Early Career Management', 'in-progress')
) as s(n, title, status) join codex.sop_statuses st on st.code = s.status
on conflict (sop_number) do nothing;

insert into codex.lifecycle_categories (code, name, sort_order) values
  ('intake', 'Intake', 1), ('maintenance-reattendance', 'Maintenance & Reattendance', 2), ('exit', 'Exit', 3)
on conflict (code) do nothing;

insert into codex.lifecycle_stages (category_id, stage_number, name, sort_order)
select c.id, s.n, s.name, s.n from (values
  ('intake', 1, 'Pipeline Building and Sourcing'), ('intake', 2, 'Recruiting / Recruitment'), ('intake', 3, 'Onboarding'),
  ('maintenance-reattendance', 4, 'Probation'), ('maintenance-reattendance', 5, 'Review'),
  ('maintenance-reattendance', 6, 'Development & Advancement'), ('exit', 7, 'Exit')
) as s(cat, n, name) join codex.lifecycle_categories c on c.code = s.cat
on conflict (stage_number) do nothing;

insert into codex.lifecycle_steps (stage_id, step_code, name, sort_order)
select st.id, s.code, s.name, s.ord from (values
  (3, '3.1', 'Pre-Onboarding', 1), (3, '3.2', 'Onboarding', 2), (5, '5.1', 'Expectation', 1), (5, '5.2', 'Reviews', 2),
  (6, '6.1', 'Development', 1), (6, '6.2', 'Advancement', 3), (7, '7.1', 'Voluntary exit', 1), (7, '7.2', 'Non-voluntary exit', 2)
) as s(stage, code, name, ord) join codex.lifecycle_stages st on st.stage_number = s.stage
on conflict (step_code) do nothing;
insert into codex.lifecycle_steps (stage_id, parent_step_id, step_code, name, sort_order)
select p.stage_id, p.id, '6.1.1', 'Competitive self development', 1 from codex.lifecycle_steps p where p.step_code = '6.1'
on conflict (step_code) do nothing;

insert into codex.practice_stages (practice_id, stage_id, step_id, phase_label, is_primary)
select p.id, st.id, sp.id, x.phase, x.primary_flag from (values
  ('P1', 1, null, 'Phase 02', true), ('P1', 2, null, 'Phase 02', true), ('P1', 3, null, 'Phase 01', true), ('P1', 4, null, 'Phase 02', true),
  ('P1', 5, null, null, false), ('P1', 6, null, null, false),
  ('P2', 6, '6.1.1', null, true), ('P3', 5, '5.2', null, true), ('P4', 6, '6.2', null, true), ('P5', 6, null, null, true),
  ('P6', 6, '6.1.1', null, true), ('P7', 5, '5.2', null, true), ('P8', 6, null, null, true), ('P8', 7, null, null, false),
  ('P9', 7, '7.2', null, true)
) as x(practice, stage, step, phase, primary_flag)
join codex.practices p on p.code = x.practice
join codex.lifecycle_stages st on st.stage_number = x.stage
left join codex.lifecycle_steps sp on sp.step_code = x.step
on conflict do nothing;

-- Requires migration 0010 (adds the colour column).
insert into outcomes.pillars (code, name, sort_order, color) values ('care', 'Care', 1, '#70BF44'), ('convenience', 'Convenience', 2, '#41B6E6'), ('time', 'Time', 3, '#003087')
on conflict (code) do update set color = coalesce(outcomes.pillars.color, excluded.color);
insert into outcomes.outcome_statuses (code, name, sort_order) values
  ('not-started', 'Not started', 1), ('on-track', 'On track', 2), ('at-risk', 'At risk', 3), ('achieved', 'Achieved', 4)
on conflict (code) do nothing;
insert into outcomes.areas (code, name, sort_order) values ('operations', 'Operations', 1), ('team-1', 'Team 1', 2),
  ('team-2', 'Team 2', 3), ('administration', 'Administration', 4), ('team-3', 'Team 3', 5), ('team-4', 'Team 4', 6)
on conflict (code) do nothing;
insert into outcomes.areas (parent_area_id, code, name, sort_order)
select p.id, c.code, c.name, c.ord from (values ('unit-a', 'Unit A', 1), ('unit-b', 'Unit B', 2)) as c(code, name, ord)
join outcomes.areas p on p.code = 'operations'
on conflict (code) do nothing;
-- Administration is split into sub-areas (admins can add more in Admin > Structure). Requires 0014 for outcomes.
insert into outcomes.areas (parent_area_id, code, name, sort_order)
select p.id, c.code, c.name, c.ord from (values ('human-resources', 'Human Resources', 1), ('finance', 'Finance', 2), ('it', 'IT', 3)) as c(code, name, ord)
join outcomes.areas p on p.code = 'administration'
on conflict (code) do nothing;

-- Default layout (SOP placements follow the earlier blueprint; practice -> value links are a draft to confirm).
select codex.apply_layout($j$
{"practices": {
  "P1": {"sops": [1, 5, 12], "values": ["quality", "consistency"]},
  "P2": {"sops": [5], "values": ["quality", "availability"]},
  "P3": {"sops": [6], "values": ["consistency", "quality"]},
  "P4": {"sops": [6], "values": ["quality", "consistency"]},
  "P5": {"sops": [], "values": ["customer-first", "availability"]},
  "P6": {"sops": [], "values": ["quality"]},
  "P7": {"sops": [], "values": ["mutual-respect", "consistency"]},
  "P8": {"sops": [], "values": ["mutual-respect", "customer-first"]},
  "P9": {"sops": [8], "values": ["availability", "mutual-respect", "consistency", "customer-first", "quality"]}}}
$j$::jsonb);

commit;
