import { App,  Notice, Plugin, PluginSettingTab, requestUrl, Setting} from 'obsidian';
import { checkSinglePluginForUpdate } from './src/checkSinglePluginForUpdate';
import * as path from 'path';
// Remember to rename these classes and interfaces!

interface ManagedPlugin {
	name: string;
	repoUrl: string;
	pluginFolder: string;
	latestVersion?: string;
	githubToken?: string;
}

interface AltPluginManagerSettings {
	plugins: ManagedPlugin[];
	checkPeriodMinutes: number;
	autoInstall: boolean;
}

const DEFAULT_SETTINGS: AltPluginManagerSettings = {
	plugins: [],
	checkPeriodMinutes: 60,
	autoInstall: false,
};

export default class AltPluginManager extends Plugin {
	settings: AltPluginManagerSettings;

	async onload() {
		await this.loadSettings();

		// Add ribbon icon for manual update check
		this.addRibbonIcon('refresh-ccw', 'Check for plugin updates', async () => {
			await this.checkForUpdates();
		});

		// Add settings tab
		this.addSettingTab(new AltPluginManagerSettingTab(this.app, this));

		// Delayed check for updates on start
		setTimeout(() => this.checkForUpdates(), 5000);

		// Periodic check for updates
		this.registerInterval(window.setInterval(() => this.checkForUpdates(), this.settings.checkPeriodMinutes * 60 * 1000));
	}

	onunload() { }

	async checkForUpdates() {
		// Create status bar item
		// @ts-ignore
		if (this._statusBar) this._statusBar.remove();
		// @ts-ignore
		this._statusBar = this.addStatusBarItem();
		const statusBar = this._statusBar;
		statusBar.setText('Checking for plugin updates...');
		try {
			for (const plugin of this.settings.plugins) {
				statusBar.setText(`Checking: ${plugin.name}`);
				const updateInfo = await checkSinglePluginForUpdate(
					plugin,
					fetch,
					(msg: string) => new Notice(msg)
				);
				if (updateInfo && updateInfo.updateAvailable && this.settings.autoInstall) {
					statusBar.setText(`Updating: ${plugin.name}`);
					await this.installPluginUpdate(plugin, updateInfo, statusBar);
				} else if (updateInfo && updateInfo.updateAvailable) {
					statusBar.setText(`Update available: ${plugin.name}`);
				}
			}
			statusBar.setText('Plugin update check complete');
		} catch (e) {
			statusBar.setText('Error during update check');
		}
		// Dispose status bar after short delay
		setTimeout(() => {
			statusBar.remove();
			this._statusBar = null;
		}, 2000);
	}

	/**
	 * Installs the update for a plugin using the provided update info.
	 * Optionally updates the status bar if provided.
	 */
	async installPluginUpdate(
		plugin: ManagedPlugin,
		updateInfo: { latestVersion: string; assets: Record<string, number>; updateAvailable: boolean; },
		statusBar?: HTMLElement
	) {
		try {
			const pluginFolder = path.join('.obsidian/plugins', plugin.pluginFolder);
			// @ts-ignore
			await this.app.vault.adapter.mkdir(pluginFolder).catch(() => { }); // ensure folder exists
			for (const [file, assetId] of Object.entries(updateInfo.assets)) {
				if (statusBar) statusBar.setText(`Downloading: ${plugin.name}/${file}`);
				if (!assetId) {
					console.error(`Asset ID not found for ${file} in ${plugin.name}`);
					if (statusBar) statusBar.setText(`Failed: ${plugin.name}/${file}`);
					continue;
				}
				const fileContent = await fetchGitHubReleaseAsset(
					plugin.repoUrl,
					assetId,
					plugin.githubToken
				);
				if (!fileContent) {
					console.error(`Failed to download ${file} for ${plugin.name}`);
					if (statusBar) statusBar.setText(`Failed: ${plugin.name}/${file}`);
					continue;
				}
				// Convert string to ArrayBuffer for binary write
				// Detailed tracing and robust error handling for file writing
				// Compose targetPath from vault base path and plugin folder
				// @ts-ignore
				const vaultBase = this.app.vault.adapter.basePath || '';
				const targetPath = `${vaultBase}/${pluginFolder}/${file}`;
				console.log(`[TRACE] Preparing to write file: ${targetPath}`);
				console.log(`[TRACE] Data size: ${typeof fileContent === 'string' ? fileContent.length : Buffer.byteLength(fileContent)} bytes`);
				try {
					await window.require('fs').promises.writeFile(targetPath, fileContent, 'utf8');
					console.log(`[TRACE] Successfully wrote file: ${targetPath}`);
				} catch (err) {
					console.error(`[ERROR] Failed to write file: ${targetPath}`);
					console.error(`[ERROR] Details:`, err);
					new Notice(`Error writing file ${file} for ${plugin.name}: ${err}`);
					if (statusBar) statusBar.setText(`Error writing: ${plugin.name}/${file}`);
					throw err;
				}
			}
			if (statusBar) statusBar.setText(`Updated: ${plugin.name} to ${updateInfo.latestVersion}`);
			new Notice(`Updated ${plugin.name} to ${updateInfo.latestVersion}\nPlease reload Plugin manually!`,0);
			plugin.latestVersion = updateInfo.latestVersion;
			await this.saveSettings();
		} catch (e) {
			if (statusBar) statusBar.setText(`Error updating: ${plugin.name}`);
			new Notice(`Error installing update for ${plugin.name}: ${e}`);
		}
	}
	// Track the current status bar item
	private _statusBar: HTMLElement | null = null;

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class AltPluginManagerSettingTab extends PluginSettingTab {
	plugin: AltPluginManager;

	constructor(app: App, plugin: AltPluginManager) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Managed Plugins Section
		containerEl.createEl('h2', { text: 'Managed Plugins' });
		
		if (this.plugin.settings.plugins.length === 0) {
			containerEl.createEl('p', { text: 'No plugins tracked yet. Add one below to get started.' });
		} else {
			const pluginsContainer = containerEl.createDiv('alt-pm-plugins-list');
			this.plugin.settings.plugins.forEach((p, idx) => {
				const pluginItem = pluginsContainer.createDiv('alt-pm-plugin-item');
				
				const headerDiv = pluginItem.createDiv('alt-pm-plugin-header');
				headerDiv.createEl('strong', { text: p.name });
				headerDiv.createEl('code', { text: p.repoUrl });
				
				const statusDiv = pluginItem.createDiv('alt-pm-plugin-status');
				statusDiv.createSpan({ text: `Latest version: ` });
				statusDiv.createEl('strong', { text: p.latestVersion || 'unknown' });
				
				const setting = new Setting(pluginItem);
				setting.addText(text => text
					.setPlaceholder('Plugin folder')
					.setValue(p.pluginFolder || '')
					.onChange(async val => {
						p.pluginFolder = val;
						await this.plugin.saveSettings();
					})
				);
				
				setting.addExtraButton(btn => btn
					.setIcon('refresh-ccw')
					.setTooltip('Check now')
					.onClick(async () => {
						await checkSinglePluginForUpdate(
							p,
							fetch,
							(msg) => new Notice(msg)
						);
					})
				);
				
				setting.addButton(btn => btn
					.setButtonText('Delete')
					.setCta()
					.onClick(async () => {
						this.plugin.settings.plugins.splice(idx, 1);
						await this.plugin.saveSettings();
						this.display();
					})
				);
			});
		}

		// Add Plugin Section
		containerEl.createEl('h2', { text: 'Add New Plugin' });
		const addSection = containerEl.createDiv('alt-pm-add-section');
		
		const formContainer = addSection.createDiv('alt-pm-add-form');
		
		const nameInput = formContainer.createEl('input', { type: 'text' });
		nameInput.placeholder = 'Plugin name';
		nameInput.className = 'alt-pm-form-input';
		nameInput.value = this._newName;
		nameInput.addEventListener('input', (e) => {
			this._newName = (e.target as HTMLInputElement).value;
		});
		
		const repoInput = formContainer.createEl('input', { type: 'text' });
		repoInput.placeholder = 'Repository URL (e.g., https://github.com/owner/repo)';
		repoInput.className = 'alt-pm-form-input';
		repoInput.value = this._newRepo;
		repoInput.addEventListener('input', (e) => {
			this._newRepo = (e.target as HTMLInputElement).value;
		});
		
		const folderInput = formContainer.createEl('input', { type: 'text' });
		folderInput.placeholder = 'Plugin folder';
		folderInput.className = 'alt-pm-form-input';
		folderInput.value = this._newFolder;
		folderInput.addEventListener('input', (e) => {
			this._newFolder = (e.target as HTMLInputElement).value;
		});
		
		const tokenInput = formContainer.createEl('input', { type: 'password' });
		tokenInput.placeholder = 'GitHub Token (optional)';
		tokenInput.className = 'alt-pm-form-input';
		tokenInput.value = this._newToken;
		tokenInput.addEventListener('input', (e) => {
			this._newToken = (e.target as HTMLInputElement).value;
		});
		
		const buttonContainer = addSection.createDiv('alt-pm-button-container');
		const addButton = buttonContainer.createEl('button', { text: 'Add Plugin' });
		addButton.className = 'mod-cta alt-pm-add-button';
		addButton.addEventListener('click', async () => {
			if (!this._newName || !this._newRepo || !this._newFolder) {
				new Notice('Name, repository URL, and plugin folder required');
				return;
			}
			this.plugin.settings.plugins.push({ 
				name: this._newName, 
				repoUrl: this._newRepo, 
				pluginFolder: this._newFolder, 
				githubToken: this._newToken 
			});
			this._newName = '';
			this._newRepo = '';
			this._newFolder = '';
			this._newToken = '';
			await this.plugin.saveSettings();
			this.display();
		});

		// Settings Section
		containerEl.createEl('h2', { text: 'Settings' });
		new Setting(containerEl)
			.setName('Check period (minutes)')
			.setDesc('How often to check for updates')
			.addText(text => text.setValue(String(this.plugin.settings.checkPeriodMinutes)).onChange(async (val) => {
				const num = parseInt(val);
				if (!isNaN(num) && num > 0) {
					this.plugin.settings.checkPeriodMinutes = num;
					await this.plugin.saveSettings();
				}
			}));
		new Setting(containerEl)
			.setName('Auto-install updates')
			.setDesc('Automatically install updates when found')
			.addToggle(toggle => toggle.setValue(this.plugin.settings.autoInstall).onChange(async (val) => {
				this.plugin.settings.autoInstall = val;
				await this.plugin.saveSettings();
			}));
	}
	private _newName = '';
	private _newRepo = '';
	private _newFolder = '';
	private _newToken = '';
}

/**
 * Fetches HTML/text from a URL, optionally using GitHub authorization if token is provided.
 * @param url The URL to fetch
 * @param githubToken Optional GitHub token for Authorization header
 */
/**
 * Downloads a release asset by its ID from a private GitHub repo using the API.
 * @param repoUrl The repository URL
 * @param assetId The asset ID
 * @param githubToken Optional GitHub token for Authorization header
 */
export async function fetchGitHubReleaseAsset(repoUrl: string, assetId: number, githubToken?: string): Promise<string | null> {
	const match = repoUrl.match(/github.com[/:]([^/]+)\/([^/]+)(?:.git)?/i);
	if (!match) {
		console.error(`Invalid repoUrl: ${repoUrl}`);
		return null;
	}
	const owner = match[1];
	const repo = match[2].replace(/\.git$/, '');
	const url = `https://api.github.com/repos/${owner}/${repo}/releases/assets/${assetId}`;
	console.debug(`[TRACE] Downloading asset from: ${url}`);
	try {
		const options: any = {
			method: 'GET',
			headers: {
				'Authorization': githubToken ? `Bearer ${githubToken}` : '',
				'Accept': 'application/octet-stream',
				'User-Agent': 'Obsidian-Alt-Plugin-Manager',
			}
		};
		const response = await requestUrl({ url, ...options });
		return response.text;
	} catch (error) {
		console.error(error);
		return null;
	}
}