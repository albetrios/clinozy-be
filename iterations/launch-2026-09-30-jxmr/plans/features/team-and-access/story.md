# Team, roles and branches

Status: ready
Kind: screen
Depends on: none
Tables: `organization`, `branch`, `user`, `membership`, `role`, `permission`, `role_permission` — [db-changes.md](../../db-changes.md)

## Stories

- As an Owner or Admin I want to invite staff with their roles, branches and hours so that they can sign in and work.
- As an Owner or Admin I want to set each role's section access and special permissions so that everyone sees only what they should.
- As an Owner or Admin I want to manage branches with their team, rooms, machines and holidays so that booking reflects the clinic.

## Rules

- A person with two roles gets the union of both (`access.membership-roles`)
- Admin cannot be narrowed; only Owner deletes the organization (`access.owner-acts`)
- Staff join by invitation; nobody sets their password (`access.staff-invitation`)
- A user works only in their branches; Owner and Admin in all (`access.branch-visibility`)

## Acceptance criteria

- **team-and-access.1** An Owner or Admin invites a staff member with one or more roles, branches and hours; the person joins by accepting the invitation — intake-files/PRD.md:106
- **team-and-access.2** Each role sees and acts only in the sections its access allows; a person with two roles gets the union — intake-files/PRD.md:26
- **team-and-access.3** A change to a role's access or special permissions applies to everyone holding it at once — intake-files/PRD.md:106
- **team-and-access.4** Branches are added with their team, rooms, machines and holidays — intake-files/PRD.md:105
- **team-and-access.5** Only Owner deletes the organization or transfers ownership; Admin holds every clinic section — intake-files/PRD.md:24
- **team-and-access.6** A removed member is restorable for 10 seconds; an inactive member is signed out — intake-files/PRD.md:150

## Work items

- `data.stage-foundation`
- `data.organization-clinic-profile`
- `data.membership-profile`
- `data.user-presence`
- `access.session-context`
- `access.membership-roles`
- `access.custom-roles`
- `access.section-permissions`
- `access.default-matrix`
- `access.action-codes`
- `access.special-permissions`
- `access.branch-visibility`
- `access.owner-acts`
- `access.staff-invitation`
- `access.member-removal`
- `operations.team`
- `operations.roles-and-access`
- `operations.branches`
- `operations.organization-settings`
- `quality.audit`
- `background.permission-refresh`
- `background.inactive-sign-out`
