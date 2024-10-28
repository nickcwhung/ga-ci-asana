import * as core from "@actions/core";
import axios from "axios";

const ASANA_TOKEN = core.getInput("asana-token");
const ASANA_BASE_URL = "https://app.asana.com/api/1.0";

const headers = {
  Authorization: `Bearer ${ASANA_TOKEN}`,
};

interface AsanaTaskDataCustomFieldsEnumOptionsI {
  gid: string;
  name: string;
}

interface AsanaTaskDataCustomFieldsI {
  gid: string;
  name: string;
  enum_options: AsanaTaskDataCustomFieldsEnumOptionsI[];
}

interface AsanaTaskDataI {
  custom_fields: AsanaTaskDataCustomFieldsI[];
}

const asana = {
  async getTask(taskId: string) {
    try {
      const response = await axios.get(`${ASANA_BASE_URL}/tasks/${taskId}`, { headers });
      return response.data.data as AsanaTaskDataI;
    } catch (error) {
      throw new Error(`Failed to get task ${taskId}: ${(error as Error).message}`);
    }
  },

  async updateTask(taskId: string, data: object) {
    try {
      const response = await axios.put(`${ASANA_BASE_URL}/tasks/${taskId}`, { data }, { headers });
      return response.data.data as AsanaTaskDataI;
    } catch (error) {
      throw new Error(`Failed to update task ${taskId}: ${(error as Error).message}`);
    }
  },
};

export default asana;
