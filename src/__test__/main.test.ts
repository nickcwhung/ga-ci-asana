import { run } from "../main";

describe("run", () => {
  it('should log "Hello World"', async () => {
    const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await run();

    expect(consoleLogSpy).toHaveBeenCalledWith("Hello World");

    consoleLogSpy.mockRestore();
  });
});
