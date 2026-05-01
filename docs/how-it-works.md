# How AGENTS.md Doctor Works

AGENTS.md Doctor is a deterministic validator for instruction files used by AI
coding agents.

It never executes commands from `AGENTS.md`. It only inspects file content,
paths, command references, and policy signals.

## Architecture Flow

```mermaid
flowchart TD
    A["User runs command<br/>lint / verify / explain"] --> B["CLI parser"]
    B --> C{"Command"}

    C -->|lint| L1["Load config<br/>.agents-doctor.json + CLI flags"]
    C -->|verify| V1["Load config<br/>.agents-doctor.json + CLI flags"]
    C -->|explain| E1["Resolve target path<br/>and applied AGENTS.md chain"]

    L1 --> D["Discover AGENTS.md files"]
    V1 --> D

    D --> R["Read files safely<br/>inside repository boundary"]
    R --> M["Markdown extraction layer<br/>headings, code, inline code, links"]
    M --> RL["Apply deterministic rules"]

    RL --> F1["size.file_too_long"]
    RL --> F2["structure.required_sections"]
    RL --> F3["paths.reference_missing"]
    RL --> F4["commands.mentioned_command_missing"]
    RL --> F5["security.risky_instruction"]

    F1 --> REP["Build report<br/>summary + findings + exit code"]
    F2 --> REP
    F3 --> REP
    F4 --> REP
    F5 --> REP

    V1 --> G1{"Instruction graph enabled?"}
    G1 -->|yes| G2["Build instruction graph<br/>explicit local instruction references"]
    G1 -->|no| REP
    G2 --> G3["Add graph findings<br/>summary, missing refs, cycles, depth"]
    G3 --> REP

    E1 --> E2["Detect deterministic conflict markers"]
    E2 --> E3{"Instruction graph enabled?"}
    E3 -->|yes| E4["Build graph from applied chain"]
    E3 -->|no| REP2["Build explain report<br/>applied chain + graph details + conflicts"]
    E4 --> REP2

    REP --> OUT{"Output format"}
    REP2 --> OUT

    OUT -->|default| H["Human terminal output"]
    OUT -->|--json| J["CI-friendly JSON output"]

    H --> X["Exit code 0 / 1 / 2"]
    J --> X
```

## Output Example

```text
agents-doctor lint: 1 warning

warning size.file_too_long AGENTS.md:1
AGENTS.md has 501 lines. Recommended maximum: 500 lines.
```

## Instruction Graph

The instruction graph is opt-in through `.agents-doctor.json`. When enabled,
`verify` and `explain` follow explicit local Markdown links and inline-code
references that look like agent instruction files, such as
`docs/agent/testing.md`, `.claude/commands/review.md`, or
`.cursor/rules/react.md`.

The graph builder does not scan all documentation, follow remote URLs, follow
symlinks, or read files outside the repository boundary.
