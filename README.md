> [!info] A plugin that enables updating a custom list of Obsidian plugins from specified sources, including GitHub and access-protected repositories, even if they are not registered in the official Obsidian Plugin list.

## Requirements

### Functional requirements

- Delayed call to `check for update` on start
- Periodical call `check for update`
	- Period setting
	- Automatically/manually install updates
	- Release expects 3 files:
		- main.js
		- styles.css
		- manifest.json
- In Plugin settings implement 'Add/Delete plugin'
- For each plugin store 
	- Repository (url) to check
	- Display latest version
	- GitHub App Token
### Non functional requirements

- GitHub
- Private repositories
## Fine-grained personal access tokens for Private Repositories

To allow this plugin to access private GitHub repositories, you need to create a Fine-grained personal access token (PAT) with the correct permissions. Follow these steps:

1. Go to your GitHub account settings > **Developer settings** > **Personal access tokens** > **Fine-grained tokens**.
2. Click **Generate new token**.
3. Give your token a name and set an expiration date (recommended).
4. Under **Repository access**, select **Only select repositories** and choose the private repositories you want to allow access to.
5. Under **Repository permissions**, set at least **Contents: Read-only**. This is required to download plugin releases.
6. Click **Generate token** and copy the token. **You will not be able to see it again!**
7. In the plugin settings, paste this token in the GitHub Token field for the relevant plugin.

**Note:** Keep your token secure. Do not share it or commit it to public repositories.

## Automating GitHub Releases

To automate the release process for your Obsidian plugin, you can use GitHub Actions to build your project and create a release with the required artifacts (`main.js`, `manifest.json`, `styles.css`).

### Example GitHub Actions Workflow

Create a file named `.github/workflows/create-release.yml` in your repository with the following content:

```yaml
name: Create Release

permissions:
	contents: write

on:
	workflow_dispatch:
	push:
		tags:
			- '*'

jobs:
	create_release:
		runs-on: ubuntu-latest
		steps:
			- name: Checkout code
				uses: actions/checkout@v4

			- name: Set up Node.js
				uses: actions/setup-node@v4
				with:
					node-version: '20'

			- name: Install dependencies
				run: npm ci

			- name: Build plugin
				run: npm run build

			- name: Get version from manifest.json
				id: get_version
				run: |
					VERSION=$(jq -r .version manifest.json)
					echo "version=$VERSION" >> $GITHUB_OUTPUT

			- name: Check if release exists
				id: check_release
				run: |
					VERSION=${{ steps.get_version.outputs.version }}
					RELEASE=$(gh release view "v$VERSION" --json tagName -q .tagName || true)
					if [ "$RELEASE" = "v$VERSION" ]; then
						echo "exists=true" >> $GITHUB_OUTPUT
					else
						echo "exists=false" >> $GITHUB_OUTPUT
					fi
				env:
					GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

			- name: Create release if not exists
				if: steps.check_release.outputs.exists == 'false'
				run: |
					VERSION=${{ steps.get_version.outputs.version }}
					gh release create "v$VERSION" --title "v$VERSION" --notes "Release v$VERSION" main.js manifest.json styles.css
				env:
					GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

			- name: Output message if release exists
				if: steps.check_release.outputs.exists == 'true'
				run: echo "Release v${{ steps.get_version.outputs.version }} already exists. Skipping creation."
```

### Steps to Set Up Automated Releases

1. **Create the workflow file:** Add the above YAML to `.github/workflows/create-release.yml` in your repository.
2. **Set up your GitHub token:**
		- Obtain a personal access token from [GitHub](https://github.com/settings/personal-access-tokens) if needed.
		- Add it to your environment (e.g., in `~/.zshrc`):
			```shell
			export GH_TOKEN=your_token_here
			```
		- Reload your shell or source the file:
			```shell
			source ~/.zshrc
			```
		- You can check if the token is set with:
			```shell
			echo $GH_TOKEN
			```
3. **Trigger the workflow:**
		- Push a new tag to your repository, or run the workflow manually from the GitHub Actions tab.
4. **Artifacts:**
		- The workflow will build your plugin and attach `main.js`, `manifest.json`, and `styles.css` to the release.

> [!Tip] You can use the [GitHub Actions extension for VS Code](https://marketplace.visualstudio.com/items?itemName=GitHub.vscode-github-actions) to manage and trigger workflows directly from your editor.

#obsidian #plugin