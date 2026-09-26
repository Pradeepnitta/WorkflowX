# WorkFlowX Database Design

## Database choices

WorkFlowX uses PostgreSQL with Prisma. PostgreSQL provides transactions, foreign keys, and indexed relational queries for organization-scoped work. Prisma provides typed access and versioned migrations. Redis and object storage are supporting systems, not substitutes for this source of truth.

## Modeling rules

- Every organization-owned aggregate is reachable through an organization ID or a project/team relation that resolves to one.
- Use UUIDs for public identifiers and `createdAt`/`updatedAt` timestamps on mutable entities.
- Store dates as timestamps where time matters; store a due date as a date when time-of-day is not part of the product rule.
- Use database enums for finite status, role, and priority values.
- Add composite unique constraints to prevent duplicate memberships.
- Use foreign keys with deliberate delete behavior. Prefer soft archive/status for projects; do not cascade-delete an entire organization accidentally.
- Store attachment metadata only in PostgreSQL; file bytes live behind a storage adapter.

## Entities and relationships

```text
Organization 1---* OrganizationMember *---1 User
Organization 1---* Team 1---* TeamMember *---1 User
Organization 1---* Project 1---* ProjectMember *---1 User
Project 1---* Task *---1 User (assignee)
Task 1---* Comment *---1 User
Comment 1---* Comment (replies)
Task 1---* Attachment *---1 User
User 1---* Notification
Organization 1---* Invitation
User 1---* ActivityLog; Project 1---* ActivityLog
```

## Prisma-ready schema

The following is the starting schema contract. It can be placed in `prisma/schema.prisma` after the PostgreSQL datasource and generator are configured.

```prisma
enum OrganizationRole {
  ADMIN
  MANAGER
  MEMBER
  VIEWER
}

enum ProjectStatus {
  PLANNING
  ACTIVE
  ON_HOLD
  COMPLETED
  ARCHIVED
}

enum ProjectVisibility {
  ORGANIZATION
  MEMBERS_ONLY
}

enum TaskStatus {
  TODO
  IN_PROGRESS
  IN_REVIEW
  COMPLETED
}

enum Priority {
  LOW
  MEDIUM
  HIGH
  URGENT
}

enum InvitationStatus {
  PENDING
  ACCEPTED
  EXPIRED
  REVOKED
}

enum NotificationType {
  TASK_ASSIGNED
  TASK_UPDATED
  COMMENT_ADDED
  MENTION
  PROJECT_INVITATION
  DEADLINE_REMINDER
}

model User {
  id             String               @id @default(uuid()) @db.Uuid
  name           String
  email          String               @unique
  passwordHash   String
  avatarUrl      String?
  createdAt      DateTime             @default(now())
  updatedAt      DateTime             @updatedAt
  memberships    OrganizationMember[]
  teamMemberships TeamMember[]
  projectMembers ProjectMember[]
  assignedTasks  Task[]               @relation("TaskAssignee")
  createdTasks   Task[]               @relation("TaskCreator")
  comments       Comment[]
  attachments    Attachment[]
  notifications  Notification[]
  activities     ActivityLog[]
}

model Organization {
  id          String               @id @default(uuid()) @db.Uuid
  name        String
  description String?
  logoUrl     String?
  createdAt   DateTime             @default(now())
  updatedAt   DateTime             @updatedAt
  members     OrganizationMember[]
  teams       Team[]
  projects    Project[]
  invitations Invitation[]
  activities  ActivityLog[]
}

model OrganizationMember {
  organizationId String           @db.Uuid
  userId         String           @db.Uuid
  role           OrganizationRole @default(MEMBER)
  joinedAt       DateTime         @default(now())
  organization   Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user           User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([organizationId, userId])
  @@index([userId])
}

model Team {
  id             String       @id @default(uuid()) @db.Uuid
  name           String
  description    String?
  organizationId String       @db.Uuid
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  members        TeamMember[]
  @@unique([organizationId, name])
  @@index([organizationId])
}

model TeamMember {
  teamId   String   @db.Uuid
  userId   String   @db.Uuid
  joinedAt DateTime @default(now())
  team     Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([teamId, userId])
  @@index([userId])
}

model Project {
  id             String            @id @default(uuid()) @db.Uuid
  name           String
  description    String?
  status         ProjectStatus     @default(PLANNING)
  visibility     ProjectVisibility @default(ORGANIZATION)
  priority       Priority          @default(MEDIUM)
  organizationId String            @db.Uuid
  createdById    String            @db.Uuid
  startDate      DateTime?
  dueDate        DateTime?
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt
  organization   Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  createdBy      User              @relation(fields: [createdById], references: [id])
  members        ProjectMember[]
  tasks          Task[]
  activities     ActivityLog[]
  @@index([organizationId, status])
  @@index([createdById])
}

model ProjectMember {
  projectId String   @db.Uuid
  userId    String   @db.Uuid
  joinedAt  DateTime @default(now())
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([projectId, userId])
  @@index([userId])
}

model Task {
  id          String       @id @default(uuid()) @db.Uuid
  title       String
  description String?
  status      TaskStatus   @default(TODO)
  priority    Priority     @default(MEDIUM)
  projectId   String       @db.Uuid
  assigneeId  String?      @db.Uuid
  createdById String       @db.Uuid
  dueDate     DateTime?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  project     Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  assignee    User?        @relation("TaskAssignee", fields: [assigneeId], references: [id], onDelete: SetNull)
  createdBy   User         @relation("TaskCreator", fields: [createdById], references: [id])
  comments    Comment[]
  attachments Attachment[]
  @@index([projectId, status, priority])
  @@index([assigneeId, status])
  @@index([dueDate])
}

model Comment {
  id        String    @id @default(uuid()) @db.Uuid
  content   String
  taskId    String    @db.Uuid
  authorId  String    @db.Uuid
  parentId  String?   @db.Uuid
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  task      Task      @relation(fields: [taskId], references: [id], onDelete: Cascade)
  author    User      @relation(fields: [authorId], references: [id], onDelete: Cascade)
  parent    Comment?  @relation("CommentReplies", fields: [parentId], references: [id], onDelete: Cascade)
  replies   Comment[] @relation("CommentReplies")
  @@index([taskId, createdAt])
  @@index([parentId])
}

model Attachment {
  id           String   @id @default(uuid()) @db.Uuid
  fileName     String
  storageKey   String   @unique
  fileUrl      String?
  fileType     String
  fileSize     Int
  taskId       String   @db.Uuid
  uploadedById String   @db.Uuid
  createdAt    DateTime @default(now())
  task         Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  uploadedBy   User     @relation(fields: [uploadedById], references: [id])
  @@index([taskId])
}

model Notification {
  id        String           @id @default(uuid()) @db.Uuid
  userId    String           @db.Uuid
  type      NotificationType
  message   String
  isRead    Boolean          @default(false)
  createdAt DateTime         @default(now())
  user      User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, isRead, createdAt])
}

model ActivityLog {
  id             String        @id @default(uuid()) @db.Uuid
  userId         String        @db.Uuid
  organizationId  String        @db.Uuid
  projectId      String?       @db.Uuid
  action         String
  metadata       Json?
  createdAt      DateTime      @default(now())
  user           User          @relation(fields: [userId], references: [id])
  organization   Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  project        Project?      @relation(fields: [projectId], references: [id], onDelete: SetNull)
  @@index([organizationId, createdAt])
  @@index([projectId, createdAt])
}

model Invitation {
  id             String           @id @default(uuid()) @db.Uuid
  email          String
  organizationId String           @db.Uuid
  role           OrganizationRole @default(MEMBER)
  tokenHash      String           @unique
  expiresAt      DateTime
  status         InvitationStatus @default(PENDING)
  createdAt      DateTime         @default(now())
  organization   Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  @@index([organizationId, status])
  @@index([email, status])
}
```

## Integrity and migration notes

- Normalize emails before uniqueness checks and store them in a consistent case.
- Enforce that assignees and project members belong to the same organization in the service layer; this cross-table rule should also be covered by integration tests.
- A comment reply must belong to the same task as its parent; validate this in the comment service.
- Use transactions for invitation acceptance, membership creation, role changes, and project/task mutations that also create activity or notification records.
- The first migration should import the current JSON tasks into one seed organization, one seed project, and matching users or placeholder member records. Keep this migration one-way and preserve existing task titles/statuses.
- Add full-text or search-specific indexes only after measuring search requirements; do not add broad indexes speculatively.
