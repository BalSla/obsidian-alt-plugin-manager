import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, requestUrl, Setting } from 'obsidian';
import { checkSinglePluginForUpdate, ManagedPlugin } from './src/checkSinglePluginForUpdate';
// Remember to rename these classes and interfaces!




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
			new Notice('Checking for plugin updates...');
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
		   const statusBar = this.addStatusBarItem();
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
					   await this.installPluginUpdate(plugin, updateInfo);
				   } else if (updateInfo && updateInfo.updateAvailable) {
					   new Notice(`Update available for ${plugin.name}: ${updateInfo.latestVersion}`);
				   }
			   }
			   statusBar.setText('Plugin update check complete');
		   } catch (e) {
			   statusBar.setText('Error during update check');
		   }
		   // Dispose status bar after short delay
		   setTimeout(() => statusBar.remove(), 2000);
	   }



	   /**
		* Installs the update for a plugin using the provided update info.
		*/
	   async installPluginUpdate(plugin: ManagedPlugin, updateInfo: { latestVersion: string; assets: Record<string, string>; updateAvailable: boolean; }) {
		   try {
			   const requiredFiles = ['main.js', 'styles.css', 'manifest.json'];
			   const pluginFolder = this.getPluginFolderPath(plugin.name);
			   // @ts-ignore
			   await this.app.vault.adapter.mkdir(pluginFolder).catch(() => { }); // ensure folder exists
			   for (const file of requiredFiles) {
				   const fileContent = await nonCorsGetHtml(updateInfo.assets[file]);
				   if (!fileContent) {
					   new Notice(`Failed to download ${file} for ${plugin.name}`);
					   continue;
				   }
				   // Convert string to ArrayBuffer for binary write
				   const encoder = new TextEncoder();
				   const data = encoder.encode(fileContent);
				   // @ts-ignore
				   await this.app.vault.adapter.writeBinary(`${pluginFolder}/${file}`, data);
			   }
			   new Notice(`Updated ${plugin.name} to ${updateInfo.latestVersion}`);
			   plugin.latestVersion = updateInfo.latestVersion;
			   await this.saveSettings();
		   } catch (e) {
			   new Notice(`Error installing update for ${plugin.name}: ${e}`);
		   }
	   }

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Get the plugin folder path in the vault for a given plugin name.
	 * This assumes the folder is in .obsidian/plugins/{pluginName}
	 */
	getPluginFolderPath(pluginName: string): string {
		// @ts-ignore
		const base = this.app.vault.adapter.basePath || '';
		return `${base}/.obsidian/plugins/${pluginName}`;
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
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

		containerEl.createEl('h2', { text: 'Managed Plugins' });

		this.plugin.settings.plugins.forEach((p, idx) => {
			const setting = new Setting(containerEl)
				.setName(p.name || p.repoUrl)
				.setDesc(`Latest: ${p.latestVersion || 'unknown'} | ${p.repoUrl}`)
				.addButton(btn => btn.setButtonText('Delete').setCta().onClick(async () => {
					this.plugin.settings.plugins.splice(idx, 1);
					await this.plugin.saveSettings();
					this.display();
				}));
			   setting.addExtraButton(btn => btn.setIcon('refresh-ccw').setTooltip('Check now').onClick(async () => {
				   await checkSinglePluginForUpdate(
					   p,
					   fetch,
					   (msg) => new Notice(msg)
				   );
			   }));
		});

		new Setting(containerEl)
			.setName('Add Plugin')
			.setDesc('Add a new plugin by repository URL')
			.addText(text => text.setPlaceholder('Plugin name').onChange(val => (this._newName = val)))
			.addText(text => text.setPlaceholder('Repository URL').onChange(val => (this._newRepo = val)))
			.addText(text => text.setPlaceholder('GitHub Token (optional)').onChange(val => (this._newToken = val)))
			.addButton(btn => btn.setButtonText('Add').setCta().onClick(async () => {
				if (!this._newName || !this._newRepo) {
					new Notice('Name and repository URL required');
					return;
				}
				this.plugin.settings.plugins.push({ name: this._newName, repoUrl: this._newRepo, githubToken: this._newToken });
				await this.plugin.saveSettings();
				this.display();
			}));

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
	private _newToken = '';
}

export async function nonCorsGetHtml(url: string): Promise<string|null> {
	console.log("Fetching URL:", url);
	try {
		return await requestUrl(url).text;
	}
	catch (error) {
		console.error(error);
		return null;
	}
}