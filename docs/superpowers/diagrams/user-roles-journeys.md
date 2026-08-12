# User Roles — Journey/Flow Diagrams

## Student Journey

```mermaid
flowchart TD
    A[Visit LMS] --> B{Has Account?}
    B -->|No| C[Redirect to AmmaWallet Register]
    C --> D[Create AmmaWallet Account]
    D --> E[SSO Callback → LMS]
    B -->|Yes| F[Login via AmmaWallet SSO]
    F --> E
    E --> G[Student Dashboard]
    G --> H[Browse Courses]
    H --> I[Enroll in Course]
    I --> J[View Course Content]
    J --> K[Complete Lessons]
    K --> L[Take Quizzes]
    L --> M[Submit Assignments]
    M --> N{Completion Requirements Met?}
    N -->|No| J
    N -->|Yes| O[Apply for Certificate]
    O --> P[Lecturer Recommends]
    P --> Q[Admin Approves]
    Q --> R[NFT Minted to Stellar]
    R --> S[View Badge in Gallery]

    K --> T{N+ Courses Completed?<br/>N = tenant config, default 3}
    T -->|Yes| U[Auto-Promote to Super-Student]
    U --> V[Access Perks Marketplace]
    T -->|No| J
```

## Parent Journey

```mermaid
flowchart TD
    A[Parent Registers via AmmaWallet] --> B[Admin Assigns Parent Role]
    B --> C[Parent Dashboard]
    C --> D[Create Student Account]
    D --> E[Student Linked to Parent]
    C --> F[Create Family Group]
    F --> G[Add Students to Group]
    C --> H[View Student Progress]
    H --> I[Check Lesson Completion %]
    H --> J[View Login History]
    C --> K[Manage Student Wallets]
    K --> L[Fund Student Wallet]
    K --> M[View Wallet Balance]
    C --> N[Pay for Course Enrollment]
    N --> O[Select Course + Student]
    O --> P[Payment via Paystack/Stellar]
    C --> Q[Set Up Rewards]
    Q --> R[Prefund Reward Amount]
    R --> U[Platform-Managed Balance<br/>AmmaWallet has no escrow — Decision #3 resolved]
    U --> V[Student Completes Goal]
    V --> W[Release Reward]
    C --> X[View Parent Billing]
    C --> Y[Message Students]
```

## Teacher Journey

```mermaid
flowchart TD
    A[Teacher Invited by Admin] --> B[Register/Login]
    B --> C[Teacher Dashboard]
    C --> D[Create Class Group]
    D --> E[Invite Students to Course]
    E --> F[Students Enroll]
    C --> G[View Class Progress]
    G --> H[Per-Student Completion %]
    G --> I[Student Login History]
    C --> J[Fund Student Enrollment]
    J --> K[Pay via Paystack/Stellar]
    C --> L[Set Up Class Rewards]
    L --> M[Per-Class / Per-Student / All]
    M --> N[Prefund Amount]
    C --> O[View Class Analytics]
    O --> P[Completion Rates]
    O --> Q[Engagement Metrics]
    C --> R[View Teacher Billing]
    C --> S[Message Students]

    style C fill:#7c3aed,color:#fff
```

## Instructor Journey

```mermaid
flowchart TD
    A[Instructor Login] --> B[Instructor Dashboard]
    B --> C[Create Course Draft]
    C --> D[Add Weeks/Sections/Items]
    D --> E[Link Quizzes]
    E --> F[Set Completion Requirements]
    F --> G[Submit for Approval]
    G --> H{Admin Review}
    H -->|Approved| I[Course Published]
    H -->|Rejected| J[Review Feedback]
    J --> C
    I --> K[Students Enroll]
    B --> L[Assign Teaching Assistants]
    L --> M[TA Gets Access to Course]
    B --> N[View Student Progress]
    N --> O[Grade Submissions]
    B --> P[Review TA Grades]
    P --> Q{Approve TA Grade?}
    Q -->|Yes| R[Grade Finalized]
    Q -->|No| S[Return to TA]
    B --> T[Certificate Recommendations]
    T --> U[Approve/Not Ready]
    B --> V[View Enrollment Analytics]
    B --> W[Message Students]

    style B fill:#16a34a,color:#fff
```

## Teaching Assistant Journey

```mermaid
flowchart TD
    A[TA Assigned by Instructor] --> B[TA Dashboard]
    B --> C[View Assigned Class Roster]
    C --> D[Limited Profile Fields]
    B --> E[View Student Submissions]
    E --> F[Grade Submission]
    F --> G["Grade = Pending Approval<br/>(ALWAYS requires explicit approval — Decision #4)"]
    G --> H{Instructor/Admin Approves?}
    H -->|Yes| I[Grade Published]
    H -->|No| J[Feedback to TA]
    J --> F
    B --> K[Add Course Materials]
    K --> L["Materials = Pending Approval<br/>(ALWAYS requires explicit approval — Decision #4)"]
    L --> M{Instructor/Admin Approves?}
    M -->|Yes| N[Material Published]
    M -->|No| O[Feedback to TA]
    B --> P[Message Assigned Students]

    style B fill:#06b6d4,color:#fff
```

## Sponsor Journey

```mermaid
flowchart TD
    A[Sponsor Invited by Admin] --> B[Register/Login]
    B --> C[Sponsor Dashboard]
    C --> D[Create Cohort]
    D --> E[Select Course + Tier]
    E --> F[Invite Students to Cohort]
    F --> G[Bulk Apply for Course]
    C --> H[Pay for Cohort]
    H --> I[Bulk Payment]
    C --> J[View Cohort Progress]
    J --> K[Per-Member Completion %]
    J --> L[Certificate Status]
    C --> M[Send Payment Reminders]
    C --> N[View Spending Report]
    C --> O[View Impact Report]
    O --> P[Aggregate Outcomes]
    O --> Q[Anonymized Stats]
    C --> R[Set Up Rewards]
    R --> S[Per-Student / All Students]
    C --> T[View Sponsor Billing]
    C --> U[Message Students]

    style C fill:#2563eb,color:#fff
```

## Employer Journey

```mermaid
flowchart TD
    A[Employer Invited by Admin] --> B[Register/Login]
    B --> C[Employer Dashboard]
    C --> D[Create Team Group]
    D --> E[Add Employees to Team]
    C --> F[Invite Employees to Course]
    F --> G[Pay for Enrollment]
    C --> H[View Team Progress]
    H --> I[Per-Employee Completion]
    H --> J[Team Completion Rates]
    C --> K[View Team Reports]
    K --> L[Course Completion by Team]
    K --> M[Engagement Metrics]
    C --> N[Set Up Rewards]
    N --> O[Per-Employee / All]
    C --> P[View Employer Billing]
    C --> Q[Message Employees]

    style C fill:#7c3aed,color:#fff
```

## Admin Journey

```mermaid
flowchart TD
    A[Admin Login] --> B[Admin Dashboard]
    B --> C[User Management]
    C --> D[Create/Edit/Delete Users]
    C --> E[Assign Roles]
    C --> F[Suspend Accounts]
    B --> G[Course Management]
    G --> H[Create Courses]
    G --> I[Approve Instructor Drafts]
    B --> J[Certificate Management]
    J --> K[Review Applications]
    J --> L[Mint NFTs]
    B --> M[Sponsor Portal]
    M --> N[View Cohort Analytics]
    B --> O[Payment Analytics]
    O --> P[Revenue Dashboard]
    B --> Q[RBAC Panel]
    Q --> R[View Roles & Permissions]
    B --> S[Tenant Management]
    B --> T[Email Templates]
    B --> U[Broadcast Notifications]
    B --> V[Dispute/Refund Handling]

    style B fill:#f59e0b,color:#000
```

## Admin Tier Escalation Flow

```mermaid
flowchart LR
    A[Admin] -->|"CANNOT"| B[Create Admin Accounts]
    A -->|"CANNOT"| C[Assign Roles]
    D[Admin-2] -->|"CAN"| B
    D -->|"CAN"| C
    D -->|"CANNOT"| E[Appoint Super-Admin]
    F[Super-Admin] -->|"CAN"| B
    F -->|"CAN"| C
    F -->|"CANNOT"| G[Appoint Another Super-Admin]
    H[Custom-User] -->|"HARD BLOCK"| I[Receive Super-Admin Flags]

    style A fill:#f59e0b,color:#000
    style D fill:#ea580c,color:#fff
    style F fill:#dc2626,color:#fff
    style H fill:#e2e8f0,color:#000
```
