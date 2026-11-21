# Complete Workflow Loop

```mermaid
flowchart TD
    S[Session Start] --> SP[using-superpowers skill check]
    SP --> BS[brainstorming]
    BS --> WP[writing-plans]
    WP --> WT[using-git-worktrees]
    WT --> LOOP[/loop execution]

    subgraph LOOP_INNER[Loop Cycle]
        T1[Pick next TODO] --> T2[TDD: Write failing test]
        T2 --> T3[TDD: Implement]
        T3 --> T4[TDD: Verify GREEN]
        T4 --> T5[Review: Task reviewer]
        T5 --> T6[Mark VERIFIED]
        T6 --> T1
    end

    LOOP --> LOOP_INNER
    LOOP_INNER --> FR[Final: requesting-code-review]
    FR --> VBC[verification-before-completion]
    VBC --> AM[Approval Matrix]
    AM --> STOP[STOP]
```
