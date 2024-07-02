# nuveplatform-stop-instance

Stop [Nuve Platform](https://nuveplatform.com) instance.

# Usage
```
- uses: simonegaffurini/nuveplatform-stop-instance@main
  with:
    # Nuve Platform login email
    email: ''

    # Nuve Platform login password
    password: ''

    # Name of the backup
    backup: ''

    # Name of the instance to stop
    instanceName: ''

    # Wait for shutdown
    # Default: true
    wait: true

    # Shutdown timeout (in seconds), works with wait set to true
    # Default: 600 (10 minutes)
    timeout: 600

```