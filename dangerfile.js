import { danger, warn, fail } from "danger";

const pr = danger.github.pr;

if (!pr.body || pr.body.length < 10) {
  warn("This PR needs a better description.");
}

const modifiedFiles = danger.git.modified_files.concat(danger.git.created_files);
if (modifiedFiles.includes("package.json") && !modifiedFiles.includes("pnpm-lock.yaml")) {
  warn("Package.json was modified but pnpm-lock.yaml was not.");
}
