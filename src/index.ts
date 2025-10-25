import * as core from "@actions/core";
import * as github from "@actions/github";

export async function upsertPrComment() {
}


export async function run() {
    try{
        //get and convert inputs
        const token: string = core.getInput("token");
        const files: string[] = core.getInput("files").split(",").map((file) => file.trim());
        const shouldBlockPr: boolean = String(core.getInput("should_block_pr") || "").toLowerCase() === "true";

        //retrieve context data
        const octokit = github.getOctokit(token);
        const { owner, repo } = github.context.repo;
        const pr = github.context.payload.pull_request;

        if (!pr) {
            core.setFailed("No pull request found in the context.");
            return;
        }

        const changedFiles = await octokit.rest.pulls.listFiles({owner, repo, pull_number: pr.number});
        const changedFileNames = changedFiles.data.map(file => file.filename);

        core.info(`Changed files in PR #${pr.number}: ${changedFileNames.join(", ")}`);

    } catch (error: any) {
        core.setFailed(error.message);
    }
}

// only run if not in test environment for testing
if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
    void run();
}