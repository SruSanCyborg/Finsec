# Projects & Workspaces Architecture (`/projects`)

The Projects feature provides workspace management, repository overview, and project-level security posture inspection.

## Architecture

- **`ProjectsGridView` (`/projects`)**:
  - Filter bar: Real-time search by project name or repository URL, status tabs (`All`, `Healthy`, `At Risk`), and sort selection (`Compliance`, `Money at Risk`, `Name`).
  - Grid: Responsive layout rendering `ProjectCard` components.
- **`ProjectCard`**:
  - Displays project title, repository URL, branch badge, Compliance Score, Money-at-risk ticker, open findings severity breakdown, last scan time, hover elevation, and click navigation to `/projects/:projectId`.
- **`ProjectDetailView` (`/projects/:projectId`)**:
  - Dedicated project workspace inspector displaying project header, repository info, branch switcher, posture breakdown, compliance card, money-at-risk, scan list, and open findings list.

## Data Layer & Rules

- Uses `useProjectsQuery()` and `useProjectQuery(projectId)` consuming `SiriusApiClient` / `MockApiService`.
- Feature components are encapsulated in `apps/desktop/src/features/projects/`.
