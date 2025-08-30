#obsidian #plugin #idea 

> [!info] A plugin that enables updating a custom list of Obsidian plugins from specified sources, including GitHub and access-protected repositories, even if they are not registered in the official Obsidian Plugin list.

## Requirements

### Functional requirements

- Implements `check for update` that checks for plugin updates and install them
	- Options
		- Delayed call to `check for update` on start
		- Periodical call `check for update`
			- Options
				- Period setting
				- Automatically install updates
		- For each plugin
			- Repository (url) to check
			- Display latest version
			- GitHub App Token
### Non functional requirements

- Supports
	- GitHub
	- Private repositories