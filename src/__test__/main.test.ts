import { run } from "../main";
import * as core from "@actions/core";
import * as github from "@actions/github";
import asana from "../asana";

jest.mock("@actions/core");
jest.mock("@actions/github");
jest.mock("../asana");

describe("run", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Constants for format 1: /1/.../project/PROJECT_ID/task/TASK_ID
  const PROJECT_ID_1 = "01234";
  const TASK_ID_1 = "56789";
  const TASK_LINK_FORMAT_1 = `https://app.asana.com/1/32453456345345/project/${PROJECT_ID_1}/task/${TASK_ID_1}`;

  // Constants for format 2: /0/PROJECT_ID/TASK_ID/f
  const PROJECT_ID_2 = "98765";
  const TASK_ID_2 = "43210";
  const TASK_LINK_FORMAT_2 = `https://app.asana.com/0/${PROJECT_ID_2}/${TASK_ID_2}/f`;

  const TASK_USER = "johnDoe";
  const STATUS_ID = "654321";
  const CODE_REVIEW_ID = "123";
  const READY_FOR_QA_ID = "456";

  it("should fail if no pull request is found", async () => {
    github.context.payload = {};

    await run();

    expect(core.setFailed).toHaveBeenCalledWith("No pull request found.");
  });

  it("should fail if no description is found", async () => {
    github.context.payload = { pull_request: { number: 1 } };

    await run();

    expect(core.setFailed).toHaveBeenCalledWith("No description found for this pull request.");
  });

  it("should fail if no task id is found in the description", async () => {
    github.context.payload = { pull_request: { number: 1, body: "No task link here", user: { login: TASK_USER } } };

    await run();

    expect(core.setFailed).toHaveBeenCalledWith("No task id found in the description. Or link is missing.");
  });

  it("should extract task ID from format 1 URL", async () => {
    github.context.payload = {
      pull_request: { number: 1, body: `Something with ${TASK_LINK_FORMAT_1}`, user: { login: TASK_USER } },
    };
    github.context.eventName = "pull_request";
    github.context.payload.action = "opened";
    (asana.getTask as jest.Mock).mockResolvedValue({
      custom_fields: [
        {
          name: "Dev Status",
          gid: STATUS_ID,
          enum_options: [
            { name: "CODE REVIEW", gid: CODE_REVIEW_ID },
            { name: "READY FOR QA", gid: READY_FOR_QA_ID },
          ],
        },
      ],
    });

    await run();

    expect(asana.updateTask).toHaveBeenCalledWith(TASK_ID_1, { custom_fields: { [STATUS_ID]: CODE_REVIEW_ID } });
  });

  it("should extract task ID from format 2 URL", async () => {
    github.context.payload = {
      pull_request: { number: 1, body: `Something with ${TASK_LINK_FORMAT_2}`, user: { login: TASK_USER } },
    };
    github.context.eventName = "pull_request";
    github.context.payload.action = "opened";
    (asana.getTask as jest.Mock).mockResolvedValue({
      custom_fields: [
        {
          name: "Dev Status",
          gid: STATUS_ID,
          enum_options: [
            { name: "CODE REVIEW", gid: CODE_REVIEW_ID },
            { name: "READY FOR QA", gid: READY_FOR_QA_ID },
          ],
        },
      ],
    });

    await run();

    expect(asana.updateTask).toHaveBeenCalledWith(TASK_ID_2, { custom_fields: { [STATUS_ID]: CODE_REVIEW_ID } });
  });

  it("should fail if no custom field with name Status or Dev Status is found", async () => {
    github.context.payload = {
      pull_request: { number: 1, body: `Something with ${TASK_LINK_FORMAT_1}`, user: { login: TASK_USER } },
    };
    asana.getTask = jest.fn().mockResolvedValue({ custom_fields: [] });

    await run();

    expect(core.setFailed).toHaveBeenCalledWith("There is no Field with name Status or Dev Status.");
  });

  it("should fail if not all options are available in the custom field", async () => {
    github.context.payload = {
      pull_request: { number: 1, body: `Something with ${TASK_LINK_FORMAT_2}`, user: { login: TASK_USER } },
    };
    (asana.getTask as jest.Mock).mockResolvedValue({
      custom_fields: [
        {
          name: "Dev Status",
          gid: STATUS_ID,
          enum_options: [{ name: "CODE REVIEW", gid: CODE_REVIEW_ID }],
        },
      ],
    });

    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      "Not all options are available in the field. One or more options is missing: CODE REVIEW,READY FOR QA"
    );
  });

  it("should update the task status to READY FOR QA when pull request review is approved", async () => {
    github.context.payload = {
      pull_request: { number: 1, body: `Something with ${TASK_LINK_FORMAT_1}`, user: { login: TASK_USER } },
      review: { state: "approved" },
    };
    github.context.eventName = "pull_request_review";
    (asana.getTask as jest.Mock).mockResolvedValue({
      custom_fields: [
        {
          name: "Dev Status",
          gid: STATUS_ID,
          enum_options: [
            { name: "CODE REVIEW", gid: CODE_REVIEW_ID },
            { name: "READY FOR QA", gid: READY_FOR_QA_ID },
          ],
        },
      ],
    });

    await run();

    expect(asana.updateTask).toHaveBeenCalledWith(TASK_ID_1, { custom_fields: { [STATUS_ID]: READY_FOR_QA_ID } });
  });

  it("should log a message and skip status update if no relevant action is detected", async () => {
    github.context.payload = {
      pull_request: { number: 1, body: `Something with ${TASK_LINK_FORMAT_2}`, user: { login: TASK_USER } },
    };
    github.context.eventName = "push";
    (asana.getTask as jest.Mock).mockResolvedValue({
      custom_fields: [
        {
          name: "Dev Status",
          gid: STATUS_ID,
          enum_options: [
            { name: "CODE REVIEW", gid: CODE_REVIEW_ID },
            { name: "READY FOR QA", gid: READY_FOR_QA_ID },
          ],
        },
      ],
    });

    await run();

    expect(core.info).toHaveBeenCalledWith("No relevant action detected, skipping status update.");
    expect(asana.updateTask).not.toHaveBeenCalled();
  });

  it("should update multiple tasks if multiple task links with different formats are found in the description", async () => {
    const TASK_ID_3 = "67890";
    const TASK_LINK_FORMAT_1_ADDITIONAL = `https://app.asana.com/1/32453456345345/project/${PROJECT_ID_1}/task/${TASK_ID_3}`;

    github.context.payload = {
      pull_request: {
        number: 1,
        body: `Something with multiple links of different formats:\n ${TASK_LINK_FORMAT_1} \n ${TASK_LINK_FORMAT_2} \n ${TASK_LINK_FORMAT_1_ADDITIONAL}`,
        user: { login: TASK_USER },
      },
    };
    github.context.eventName = "pull_request";
    github.context.payload.action = "opened";
    (asana.getTask as jest.Mock).mockResolvedValue({
      custom_fields: [
        {
          name: "Dev Status",
          gid: STATUS_ID,
          enum_options: [
            { name: "CODE REVIEW", gid: CODE_REVIEW_ID },
            { name: "READY FOR QA", gid: READY_FOR_QA_ID },
          ],
        },
      ],
    });

    await run();

    expect(asana.updateTask).toBeCalledTimes(3);
    expect(asana.updateTask).toHaveBeenCalledWith(TASK_ID_1, { custom_fields: { [STATUS_ID]: CODE_REVIEW_ID } });
    expect(asana.updateTask).toHaveBeenCalledWith(TASK_ID_2, { custom_fields: { [STATUS_ID]: CODE_REVIEW_ID } });
    expect(asana.updateTask).toHaveBeenCalledWith(TASK_ID_3, { custom_fields: { [STATUS_ID]: CODE_REVIEW_ID } });
  });

  it("should be able to Identify CODE_REVIEW and READY_FOR_QA even when they have icons on asana", async () => {
    github.context.payload = {
      pull_request: { number: 1, body: `Something with ${TASK_LINK_FORMAT_2}`, user: { login: TASK_USER } },
    };
    github.context.eventName = "pull_request";
    github.context.payload.action = "opened";
    (asana.getTask as jest.Mock).mockResolvedValue({
      custom_fields: [
        {
          name: "Dev Status",
          gid: STATUS_ID,
          enum_options: [
            { name: "🍕 code Review", gid: CODE_REVIEW_ID },
            { name: "🍕 ready for QA extra text", gid: READY_FOR_QA_ID },
          ],
        },
      ],
    });

    await run();

    expect(asana.updateTask).toHaveBeenCalledWith(TASK_ID_2, { custom_fields: { [STATUS_ID]: CODE_REVIEW_ID } });
  });

  it("should change status to READY_FOR_QA when pull request was made by white-listed user", async () => {
    const WHITELIST_GITHUB_USERS = "approvedUser";
    (core.getInput as jest.Mock).mockReturnValue(WHITELIST_GITHUB_USERS);
    github.context.payload = {
      pull_request: { number: 1, body: `Something with ${TASK_LINK_FORMAT_1}`, user: { login: "approvedUser" } },
    };
    github.context.eventName = "pull_request";
    github.context.payload.action = "opened";
    (asana.getTask as jest.Mock).mockResolvedValue({
      custom_fields: [
        {
          name: "Dev Status",
          gid: STATUS_ID,
          enum_options: [
            { name: "CODE REVIEW", gid: CODE_REVIEW_ID },
            { name: "READY FOR QA", gid: READY_FOR_QA_ID },
          ],
        },
      ],
    });

    await run();

    expect(asana.updateTask).toHaveBeenCalledWith(TASK_ID_1, { custom_fields: { [STATUS_ID]: READY_FOR_QA_ID } });
  });
});
