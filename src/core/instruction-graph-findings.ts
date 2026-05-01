import type { ResolvedLintConfig, RuleSeverityOverride } from "../config/index.js";
import type { Finding, Severity } from "../types/index.js";
import type { InstructionGraph, InstructionGraphDiagnostic } from "./instruction-graph.js";

export function buildInstructionGraphFindings(graph: InstructionGraph, config: ResolvedLintConfig): Finding[] {
  const findings: Finding[] = [];
  const summarySeverity = getConfiguredSeverity(config, "inheritance.instruction_graph_summary", "info");

  if (summarySeverity !== "off") {
    findings.push({
      ruleId: "inheritance.instruction_graph_summary",
      severity: summarySeverity,
      message: `Instruction graph includes ${graph.nodes.length} node${graph.nodes.length === 1 ? "" : "s"} and ${graph.edges.length} edge${graph.edges.length === 1 ? "" : "s"}.`,
      file: graph.entryFiles[0],
      line: 1,
      details: {
        entryFiles: graph.entryFiles,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        diagnosticCount: graph.diagnostics.length,
        referencedInstructionFiles: graph.nodes
          .filter((node) => node.discoveredBy === "reference" && node.status === "loaded")
          .map((node) => node.id)
      }
    });
  }

  for (const diagnostic of graph.diagnostics) {
    const finding = diagnosticToFinding(diagnostic, config);

    if (finding) {
      findings.push(finding);
    }
  }

  return findings;
}

function diagnosticToFinding(diagnostic: InstructionGraphDiagnostic, config: ResolvedLintConfig): Finding | null {
  const ruleId = getDiagnosticRuleId(diagnostic);
  const severity = getConfiguredSeverity(config, ruleId, "warning");

  if (severity === "off") {
    return null;
  }

  return {
    ruleId,
    severity,
    message: getDiagnosticMessage(diagnostic),
    file: diagnostic.file,
    line: diagnostic.line,
    column: diagnostic.column,
    details: {
      code: diagnostic.code,
      reference: diagnostic.reference,
      target: diagnostic.target,
      ...(diagnostic.details ?? {})
    }
  };
}

function getDiagnosticRuleId(diagnostic: InstructionGraphDiagnostic): string {
  if (diagnostic.code === "instruction_graph_cycle") {
    return "inheritance.instruction_graph_cycle";
  }

  if (diagnostic.code === "instruction_graph_depth_exceeded") {
    return "inheritance.instruction_graph_depth_exceeded";
  }

  return "inheritance.referenced_instruction_missing";
}

function getDiagnosticMessage(diagnostic: InstructionGraphDiagnostic): string {
  if (diagnostic.code === "instruction_graph_cycle") {
    return `${diagnostic.file} references an instruction cycle at ${diagnostic.reference}.`;
  }

  if (diagnostic.code === "instruction_graph_depth_exceeded") {
    return `${diagnostic.file} references ${diagnostic.reference}, but instruction graph maxDepth was exceeded.`;
  }

  if (diagnostic.code === "instruction_reference_outside_repo") {
    return `${diagnostic.file} references an instruction file outside the repo: ${diagnostic.reference}.`;
  }

  if (diagnostic.code === "instruction_reference_symlink") {
    return `${diagnostic.file} references instruction file symlink that was not followed: ${diagnostic.reference}.`;
  }

  if (diagnostic.code === "instruction_reference_unreadable") {
    return `${diagnostic.file} references an unreadable instruction file: ${diagnostic.reference}.`;
  }

  return `${diagnostic.file} references a missing instruction file: ${diagnostic.reference}.`;
}

function getConfiguredSeverity(
  config: ResolvedLintConfig,
  ruleId: string,
  defaultSeverity: Severity
): RuleSeverityOverride {
  return config.rules[ruleId]?.severity ?? defaultSeverity;
}
