import * as core from "@actions/core";
import * as github from "@actions/github";
import asana from "./asana";

export async function run() {
  // do a regex for this new link structure. e.g. https://app.asana.com/1/1200203178379976/project/<project>/task/<taskId>
  const ASANA_TASK_LINK_REGEX =
    /https:\/\/app\.asana\.com\/\d+\/\d+\/project\/(?<project>\d+)\/task\/(?<taskId>\d+).*/gi;

  const WHITELIST_GITHUB_USERS = (core.getInput("whitelist-github-users") || "").split(",");

  const CODE_REVIEW = "CODE REVIEW";
  const READY_FOR_QA = "READY FOR QA";

  const prInfo = github.context.payload;
  if (!prInfo.pull_request) {
    core.setFailed("No pull request found.");
    return;
  }

  const description = prInfo.pull_request.body;
  if (!description) {
    core.setFailed("No description found for this pull request.");
    return;
  }

  const taskIds = [];
  let match;
  while ((match = ASANA_TASK_LINK_REGEX.exec(description)) !== null) {
    if (match.index === ASANA_TASK_LINK_REGEX.lastIndex) {
      ASANA_TASK_LINK_REGEX.lastIndex++;
    }
    if (!match.groups) {
      continue;
    }
    taskIds.push(match.groups.taskId);
  }

  if (taskIds.length === 0) {
    core.setFailed("No task id found in the description. Or link is missing.");
    return;
  }

  const task = await asana.getTask(taskIds[0]);

  if (!task.custom_fields) {
    core.setFailed("There is no custom fields in the task.");
    return;
  }

  const filterDevStatusId = task.custom_fields.filter((t) => ["STATUS", "DEV STATUS"].includes(t.name.toUpperCase()));
  if (filterDevStatusId.length === 0) {
    core.setFailed("There is no Field with name Status or Dev Status.");
    return;
  }

  const devStatusId = filterDevStatusId[0].gid;

  const optionsList = [CODE_REVIEW, READY_FOR_QA];
  const filteredOptions = filterDevStatusId[0].enum_options
    .map((o) => {
      let name = o.name.toUpperCase();
      if (name.includes(READY_FOR_QA)) {
        name = READY_FOR_QA;
      }
      if (name.includes(CODE_REVIEW)) {
        name = CODE_REVIEW;
      }
      return {
        name,
        gid: o.gid,
      };
    })
    .filter((o) => optionsList.includes(o.name.toUpperCase()));

  if (optionsList.length !== filteredOptions.length) {
    core.setFailed(`Not all options are available in the field. One or more options is missing: ${optionsList}`);
    return;
  }

  const option = filteredOptions.reduce((acc: { [key: string]: string }, curr) => {
    acc[curr.name.toUpperCase()] = curr.gid;
    return acc;
  }, {});

  const eventName = github.context.eventName;
  const action = prInfo.action;

  const prAuthor = prInfo.pull_request.user.login;

  const status = (() => {
    if (WHITELIST_GITHUB_USERS.includes(prAuthor)) {
      return option[READY_FOR_QA];
    } else {
      if (eventName === "pull_request" && (action === "opened" || action === "reopened")) {
        return option[CODE_REVIEW];
      } else if (eventName === "pull_request_review" && prInfo.review.state === "approved") {
        return option[READY_FOR_QA];
      }
    }
  })();

  if (!status) {
    core.info("No relevant action detected, skipping status update.");
    return;
  }

  await Promise.all(
    taskIds.map((taskId) =>
      asana.updateTask(taskId, {
        custom_fields: {
          [devStatusId]: status,
        },
      })
    )
  );

  core.info(`Task status updated to ${status}`);
}
