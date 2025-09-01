import { checkSinglePluginForUpdate, ManagedPlugin } from '../src/checkSinglePluginForUpdate';


describe('checkSinglePluginForUpdate', () => {
  let managedPlugin: ManagedPlugin;

  beforeEach(() => {
    managedPlugin = {
      name: 'test-plugin',
      repoUrl: 'https://github.com/owner/repo',
      latestVersion: undefined,
      githubToken: undefined,
    };
  });


  it('should skip unsupported repo', async () => {
    managedPlugin.repoUrl = 'https://gitlab.com/owner/repo';
    const noticeSpy = jest.fn();
    const result = await checkSinglePluginForUpdate(managedPlugin, fetch, noticeSpy);
    expect(noticeSpy).toHaveBeenCalledWith(expect.stringContaining('Unsupported repo'));
    expect(result).toBeNull();
  });


  it('should handle failed fetch', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false });
    const noticeSpy = jest.fn();
    const result = await checkSinglePluginForUpdate(managedPlugin, fetchMock, noticeSpy);
    expect(noticeSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch release'));
    expect(result).toBeNull();
  });


  it('should handle missing required files', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tag_name: 'v1.0.0', assets: [{ name: 'main.js', browser_download_url: 'url' }] }) });
    const noticeSpy = jest.fn();
    const result = await checkSinglePluginForUpdate(managedPlugin, fetchMock, noticeSpy);
    expect(noticeSpy).toHaveBeenCalledWith(expect.stringContaining('missing required files'));
    expect(result).toBeNull();
  });


  it('should return update info if update available', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tag_name: 'v1.0.1', assets: [
        { name: 'main.js', browser_download_url: 'url1' },
        { name: 'styles.css', browser_download_url: 'url2' },
        { name: 'manifest.json', browser_download_url: 'url3' },
      ] }) });
    const noticeSpy = jest.fn();
    const result = await checkSinglePluginForUpdate(managedPlugin, fetchMock, noticeSpy);
    expect(result).toEqual({
      latestVersion: 'v1.0.1',
      assets: {
        'main.js': 'url1',
        'styles.css': 'url2',
        'manifest.json': 'url3',
      },
      updateAvailable: true,
    });
  });

  it('should return updateAvailable: false if already up to date', async () => {
    managedPlugin.latestVersion = 'v1.0.1';
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tag_name: 'v1.0.1', assets: [
        { name: 'main.js', browser_download_url: 'url1' },
        { name: 'styles.css', browser_download_url: 'url2' },
        { name: 'manifest.json', browser_download_url: 'url3' },
      ] }) });
    const result = await checkSinglePluginForUpdate(managedPlugin, fetchMock, jest.fn());
    expect(result).toEqual({
      latestVersion: 'v1.0.1',
      assets: {},
      updateAvailable: false,
    });
  });
});

  it('real request: should fetch update info from a real GitHub repo', async () => {
    // This test does a real network request to GitHub API and is skipped by default.
    // Remove .skip to enable.
    jest.setTimeout(10000);
    const realPlugin = {
      name: 'ObsidianProgressTracker',
      repoUrl: 'https://github.com/BalSla/ObsidianProgressTracker',
      latestVersion: undefined,
      githubToken: process.env.GH_TOKEN
    };
    const notices: string[] = [];
    const result = await checkSinglePluginForUpdate(realPlugin, fetch, (msg) => notices.push(msg));
    expect(result).toBeTruthy();
    expect(result?.latestVersion).toBeTruthy();
    console.log(result?.latestVersion);
    expect(result?.assets).toBeTruthy();
    expect(Array.isArray(notices)).toBe(true);
  });