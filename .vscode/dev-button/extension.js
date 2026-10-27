const vscode = require("vscode");

// The label of the task in .vscode/tasks.json this button drives.
const LABEL = "just dev";

function activate(context) {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  context.subscriptions.push(item);

  const execution = () => vscode.tasks.taskExecutions.find((e) => e.task.name === LABEL);
  // Unfiltered: a type filter only asks task providers, which leaves out tasks.json's own tasks.
  const findTask = async () =>
    (await vscode.tasks.fetchTasks()).find((t) => t.name === LABEL);

  const render = () => {
    const running = Boolean(execution());
    vscode.commands.executeCommand("setContext", "storyteller.devRunning", running);
    item.text = running ? "$(sync~spin) dev" : "$(play) dev";
    item.tooltip = running ? "just dev is running: click to stop" : "Start just dev";
    item.command = running ? "storyteller.stopDev" : "storyteller.startDev";
    item.backgroundColor = running
      ? new vscode.ThemeColor("statusBarItem.warningBackground")
      : undefined;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("storyteller.startDev", async () => {
      if (execution()) return;
      const task = await findTask();
      if (!task) {
        vscode.window.showErrorMessage(`No "${LABEL}" task in .vscode/tasks.json`);
        return;
      }
      await vscode.tasks.executeTask(task);
    }),
    vscode.commands.registerCommand("storyteller.stopDev", () => execution()?.terminate()),
    vscode.tasks.onDidStartTask(render),
    vscode.tasks.onDidEndTask(render),
  );

  // Other workspaces with a justfile also activate this; only show up where the task exists.
  findTask().then((task) => {
    vscode.commands.executeCommand("setContext", "storyteller.devAvailable", Boolean(task));
    if (!task) return;
    render();
    item.show();
  });
}

module.exports = { activate };
