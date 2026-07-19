import { useState } from "react";

export interface UiCommandResult { ok?: boolean; message?: string }

export function useCommandRunner<T, R extends UiCommandResult = UiCommandResult>(execute?: (command: T) => Promise<R | void>) {
  const [commandError, setCommandError] = useState("");
  const [saving, setSaving] = useState(false);
  const clearCommandError = () => setCommandError("");
  const runCommand = async (command: T, fallbackMessage: string) => {
    if (!execute) return undefined;
    setSaving(true);
    setCommandError("");
    try {
      const result = await execute(command);
      if (result && result.ok === false) setCommandError(result.message || fallbackMessage);
      return result;
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : fallbackMessage);
      return undefined;
    } finally {
      setSaving(false);
    }
  };
  return { clearCommandError, commandError, runCommand, saving };
}
