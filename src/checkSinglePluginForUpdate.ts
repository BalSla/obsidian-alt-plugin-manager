
export interface ManagedPlugin {
    name: string;
    repoUrl: string;
    latestVersion?: string;
    githubToken?: string;
}

/**
 * Standalone function to check for plugin update. Accepts fetch and notice for testability.
 */
export async function checkSinglePluginForUpdate(
    plugin: ManagedPlugin,
    fetchFn: typeof fetch = fetch,
    noticeFn: (msg: string) => void
): Promise<null | {
    latestVersion: string;
    assets: Record<string, string>;
    updateAvailable: boolean;
}> {
    try {
        // Only support GitHub repos for now
        const match = plugin.repoUrl.match(/github.com[/:]([^/]+)\/([^/]+)(?:.git)?/i);
        if (!match) {
            noticeFn(`Unsupported repo: ${plugin.repoUrl}`);
            return null;
        }
        const owner = match[1];
        const repo = match[2].replace(/\.git$/, '');
        const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
        const headers: Record<string, string> = { 'Accept': 'application/vnd.github+json' };
        if (plugin.githubToken) headers['Authorization'] = `Bearer ${plugin.githubToken}`;

        // Get latest release
        const releaseRes = await fetchFn(`${apiBase}/releases/latest`, { headers });
        if (!releaseRes.ok) {
            console.error(`Failed to fetch release for ${plugin.name}: ${releaseRes.status} ${releaseRes.statusText}`);
            noticeFn(`Failed to fetch release for ${plugin.name}`);
            return null;
        }
        const release = await releaseRes.json();
        const latestVersion = release.tag_name || release.name;
        if (plugin.latestVersion === latestVersion) return { latestVersion, assets: {}, updateAvailable: false };

        // Find required assets
        const requiredFiles = ['main.js', 'styles.css', 'manifest.json'];
        const assets: Record<string, string> = {};
        for (const asset of release.assets) {
            if (requiredFiles.includes(asset.name)) {
                assets[asset.name] = asset.browser_download_url;
            }
        }
        if (!requiredFiles.every(f => assets[f])) {
            noticeFn(`Release for ${plugin.name} missing required files.`);
            return null;
        }

        return { latestVersion, assets, updateAvailable: true };
    } catch (e) {
        noticeFn(`Error checking ${plugin.name}: ${e}`);
        return null;
    }
}
