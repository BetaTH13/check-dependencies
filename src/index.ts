import * as core from "@actions/core";
import * as github from "@actions/github";

export function createPrCommentTextActionsNeeded(filesToCheck: string[], labelName: string){
    return `Files that need to be checked:\n`+
    `- ${filesToCheck.join("\n- ")}\n\n`+
    `To get rid of this message, add the following label to the PR: **${labelName}**`; 
}

export function createPrCommentTextNoActionNeeded(filesToCheck: string[]){
    return `All of the following files have been checked:\n`+
    `- ${filesToCheck.join("\n- ")}`;
}

export async function upsertPrComment(octokit: any, owner: string, repo: string, prNumber: number, body: string, marker = "check-dependencies-bot") {
    const markterStart = `<!-- ${marker}:start -->`;
    const markerEnd = `<!-- ${marker}:end -->`;

    const fullBody = `${markterStart}\n${body}\n${markerEnd}`;

    const { data: comments } = await octokit.rest.issues.listComments({ owner, repo, issue_number: prNumber, per_page: 100 });
    const existingComment = comments.find((comment: any) => typeof comment.body === 'string' && comment.body.includes(markterStart) && comment.user?.type === 'Bot');

    if (existingComment) {
        await octokit.rest.issues.updateComment({owner, repo, comment_id: existingComment.id, body: fullBody});
    } else {
        await octokit.rest.issues.createComment({owner, repo, issue_number: prNumber, body: fullBody});
    }
}

export async function addNoActionRequiredComment(octokit: any, owner: string, repo: string, prNumber: number, filesToCheck: string[]) {
    const commentBody = createPrCommentTextNoActionNeeded(filesToCheck);
    await upsertPrComment(octokit, owner, repo, prNumber, commentBody);
}

export async function addActionRequiredComment(octokit: any, owner: string, repo: string, prNumber: number, filesToCheck: string[], labelName: string) {
    const commentBody = createPrCommentTextActionsNeeded(filesToCheck, labelName);
    await upsertPrComment(octokit, owner, repo, prNumber, commentBody);
}

export async function run() {
    try{
        //get and convert inputs
        const token: string = core.getInput("token");
        const filesToCheck: string[] = core.getInput("files_to_check").split(",").map((file) => file.trim());
        const labelName: string = core.getInput("label_name") || "dependencies-changed";

        //retrieve context data
        const octokit = github.getOctokit(token);
        const { owner, repo } = github.context.repo;

        const { sender } = github.context.payload;
        core.info(`PR triggered by user: ${sender?.login}`);
        const pr = github.context.payload.pull_request;

        if (!pr) {
            core.setFailed("No pull request found in the context.");
            return;
        }
        
        //Get full PR content to access labels
        const prFullContent = await octokit.rest.pulls.get({owner, repo, pull_number: pr.number});
        const labels = prFullContent.data.labels.map(label => label.name);
        
        //Get all changed files in the PR
        const changedFiles = await octokit.rest.pulls.listFiles({owner, repo, pull_number: pr.number});
        const changedFileNames = changedFiles.data.map(file => file.filename);

        core.info(`Changed files in PR #${pr.number}: ${changedFileNames.join(", ")}`);
        core.info(`Files to check: ${filesToCheck.join(", ")}`);

        //Determine if any of the specified files were changed.
        const intersectingFiles = filesToCheck.filter(file => changedFileNames.some(changedFile => changedFile.includes(file)));
        if (intersectingFiles.length == 0) {
            core.info("None of the specified files were changed in this PR.");
            addNoActionRequiredComment(octokit, owner, repo, pr.number, filesToCheck);
            return;
        }
        const isLabelPresent = labels.includes(labelName);

        //Adds or updates PR comment based on if label is present
        if (isLabelPresent) {
            addNoActionRequiredComment(octokit, owner, repo, pr.number, intersectingFiles);
            core.info(`Label "${labelName}" is present. No further action needed.`);
            return;
        }

        addActionRequiredComment(octokit, owner, repo, pr.number, intersectingFiles, labelName);

        core.info(`Files that need to be checked:\n- ${intersectingFiles.join("\n- ")}`);
        core.setFailed("New dependencies detected. Please review the changes.");
        return;
    } catch (error: any) {
        core.setFailed(error.message);
    }
}

// only run if not in test environment for testing
if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
    void run();
}