# Disaster Recovery Plan (SOP)

This Standard Operating Procedure (SOP) defines how to recover the Swiss production platform in case of database corruption or total server loss.

---

## 1. Recovery Targets

| Metric | Target | Description |
| :--- | :--- | :--- |
| **RPO (Recovery Point Objective)** | **24 hours** | Maximum data loss window (backed up daily at 03:00 UTC). |
| **RTO (Recovery Time Objective)** | **< 15 minutes** | Maximum acceptable downtime to restore operations. |

---

## 2. Backup Procedures

### Automated Daily Backup (Cron)
Backups run automatically every night via cron:
```text
0 3 * * * /home/nikutsuki/swiss/scripts/ops/backup-postgres.sh >> /var/log/swiss-backup.log 2>&1
```

### Manual Backup (Before Any Risky Operation)
```bash
cd ~/swiss
./scripts/ops/backup-postgres.sh
```
*Backups are saved as compressed files in `backups/postgres/postgres_<db>_<timestamp>.sql.gz`.*

---

## 3. Recovery Scenarios

### Scenario A: Database Corruption or Accidental Data Deletion

If data was corrupted or deleted, restore from the latest backup:

1. **Restore latest backup (interactive prompt):**
   ```bash
   cd ~/swiss
   ./scripts/ops/restore-postgres.sh
   ```
2. **Or restore a specific backup file without prompt:**
   ```bash
   ./scripts/ops/restore-postgres.sh backups/postgres/postgres_utils_db_20260924_175000Z.sql.gz --yes
   ```
3. **Verify all services can query the database:**
   ```bash
   ./scripts/deploy/healthcheck.sh
   ```

---

### Scenario B: Total VPS Failure (Rebuilding on a Fresh Server)

If the VPS is destroyed or compromised, follow this 15-minute rebuild procedure:

#### Step 1: Install Docker on the Fresh Server
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

#### Step 2: Clone the Repository
```bash
git clone https://github.com/Nikutsuki/swiss.git ~/swiss
cd ~/swiss
```

#### Step 3: Restore Configuration & SSL Certificates
1. Copy your production environment file from your password manager:
   ```bash
   nano deploy/.env.prod
   chmod 600 deploy/.env.prod
   ```
2. Create the SSL directory and restore the Cloudflare Origin certificates:
   ```bash
   sudo mkdir -p /root/nikutsuki/ssl
   # Place origin-cert.pem and origin-key.pem in /root/nikutsuki/ssl/
   ```

#### Step 4: Transfer the Latest Database Backup
Copy your latest `.sql.gz` backup file into `~/swiss/backups/postgres/`.

#### Step 5: Start the Stack & Restore the Database
```bash
# Start all services
./scripts/deploy/deploy.sh

# Restore data from the backup
./scripts/ops/restore-postgres.sh --yes
```

#### Step 6: Verify Everything Is Online
```bash
./scripts/deploy/healthcheck.sh
```
If your VPS IP changed, update the Cloudflare DNS records (`www`, `auth`, `monolith`, etc.) to point to the new IP.
