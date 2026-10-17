// Shared by guardrails.mjs (the push review gate) and push-ci-watch.mjs: the directory a
// `git push` command runs in — its `git -C <dir>`, else its last `cd <dir>`, else the session's
// working directory — so a hook judges only pushes in its own repository.
import { resolve } from "node:path";

/** The absolute directory `command` pushes from, resolved against `cwd`. */
export function pushDirectory({ command, cwd }) {
  const flag = /\bgit\s+-C\s+(\S+)[^;&|]*\bpush\b/.exec(command)?.[1];
  const changes = [...command.matchAll(/(?:^|[;&|]\s*)cd\s+(\S+)/g)].map((match) => match[1]);
  const target = flag ?? changes.pop();
  return target ? resolve(cwd, target) : cwd;
}

/** True when `directory` is `repositoryRoot` or inside it. */
export function isInRepository({ directory, repositoryRoot }) {
  return directory === repositoryRoot || directory.startsWith(`${repositoryRoot}/`);
}
