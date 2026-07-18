# MES server deploy runbook

Цель: переносить прототип MES на сервер так, чтобы пользовательские данные тестового контура не удалялись при обновлениях.

## Контуры

Рекомендуемая схема на одной виртуальной машине:

- `dev` - внутренний контур без пользователей, можно чаще обновлять и ломать.
- `pilot` - рабочий контур Codex и прототипирования. Берет данные из `stage` только по ручному сценарию и не пишет их обратно.
- `stage` - контур тестирования реальными пользователями. Данные сохраняются между релизами.
- `prod` - будущий промышленный контур после стабилизации `stage`.

Минимальные переменные окружения для каждого процесса:

Готовые шаблоны:

- `deploy/env/mes-dev.env.example`;
- `deploy/env/mes-pilot.env.example`;
- `deploy/systemd/mes-dev.service`;
- `deploy/systemd/mes-pilot.service`;
- `deploy/caddy/Caddyfile.example`;
- `deploy/nginx/mes-two-contours.conf.example`.

Фактический текущий сервер использует Caddy. Nginx-шаблон оставлен как альтернативный пример, но не должен запускаться одновременно с Caddy на портах `80/443`.

```bash
APP_ENV=dev
PORT=4174
HOST=127.0.0.1
MES_SHARED_STATE_DIR=/srv/mes/dev/shared-state
MES_BACKUP_DIR=/srv/mes/dev/backups
MES_AUDIT_LOG_PATH=/srv/mes/dev/audit/audit.log
APP_BASE_URL=https://staging.mes-line.ru
```

```bash
APP_ENV=pilot
PORT=4175
HOST=127.0.0.1
MES_SHARED_STATE_DIR=/srv/mes/pilot/shared-state
MES_BACKUP_DIR=/srv/mes/pilot/backups
MES_AUDIT_LOG_PATH=/srv/mes/pilot/audit/audit.log
APP_BASE_URL=https://pilot.mes-line.ru
MES_ALLOW_DESTRUCTIVE_ACTIONS=false
MES_ENABLE_WORKFLOW_PRESET_RESTORE=false
```

## Перед первым запуском

1. Создать отдельного Linux-пользователя для сервиса, например `mes`.
2. Создать директории:

```bash
sudo mkdir -p /srv/mes/dev/shared-state /srv/mes/dev/backups /srv/mes/dev/audit
sudo mkdir -p /srv/mes/pilot/shared-state /srv/mes/pilot/backups /srv/mes/pilot/audit
sudo chown -R mes:mes /srv/mes
```

3. Не хранить пользовательский shared-state внутри git checkout.
4. Не использовать `rm -rf` для shared-state, backup или audit директорий.
5. Проверить env до запуска:

```bash
APP_ENV=pilot \
PORT=4175 \
HOST=127.0.0.1 \
APP_BASE_URL=https://pilot.mes-line.ru \
MES_SHARED_STATE_DIR=/srv/mes/pilot/shared-state \
MES_BACKUP_DIR=/srv/mes/pilot/backups \
MES_AUDIT_LOG_PATH=/srv/mes/pilot/audit/audit.log \
MES_ALLOW_DESTRUCTIVE_ACTIONS=false \
MES_ENABLE_WORKFLOW_PRESET_RESTORE=false \
npm run server:preflight -- --create-dirs
```

## Pre-deploy checklist

Выполнять из рабочей директории проекта:

```bash
git status --short
npm ci
npm run build
npm run qa:ui
npm run qa:css
npm run qa:architecture
npm run qa:visual
npm run qa:ui:regression
npm run qa:functional
git diff --check
```

Если любой пункт упал, deploy остановить.

## Backup перед обновлением

Для контура `pilot`:

```bash
APP_ENV=pilot \
MES_SHARED_STATE_DIR=/srv/mes/pilot/shared-state \
MES_BACKUP_DIR=/srv/mes/pilot/backups \
MES_AUDIT_LOG_PATH=/srv/mes/pilot/audit/audit.log \
npm run backup:shared-state -- --reason=before-deploy --actor=deploy
```

Проверить список backup:

```bash
APP_ENV=pilot \
MES_BACKUP_DIR=/srv/mes/pilot/backups \
npm run list:shared-state-backups
```

## Deploy

### Не обновлять активную папку напрямую

Текущий пилот работает из неизменяемого release-артефакта. `/srv/mes/pilot/app`
является симлинком на конкретный релиз, а не Git checkout. Поэтому запрещены:

- `git pull` в `/srv/mes/pilot/app`;
- `rsync` или ручное редактирование активной папки;
- сборка или `npm ci` внутри активного приложения.

Такой подход сохраняет возможность точного отката: Git-коммит — источник кода,
а сервер исполняет проверенный артефакт с манифестом хешей. Данные, секреты и
`bootstrap-snapshot.json` остаются внешними операционными ресурсами.

### Последовательность обновления

1. Закоммитить и отправить проверенный код в Git. Стадирование перед сборкой
   самостоятельно получает актуальную ветку upstream и откажется от локального
   коммита, которого там нет.
2. В чистом отдельном Git worktree собрать и стадировать релиз:

```bash
npm run release:stage:pilot -- --release-id=<version-and-commit>
```

3. Убедиться, что stage завершился успешно. Он не затрагивает работающий
   пилот, а только создаёт новый артефакт в `/srv/mes/pilot/releases`.
4. Атомарно активировать именно этот релиз:

```bash
npm run release:activate:pilot -- --release-id=<version-and-commit>
```

Активация перепроверяет хеши, переключает симлинк, перезапускает сервис и
проверяет локальный и публичный `/healthz`. При ошибке она автоматически
возвращает предыдущий релиз. Полный контракт и ручной rollback описаны в
[`release-process.md`](./release-process.md).

## Post-deploy QA

1. Открыть главную страницу контура.
2. Проверить вход под тестовым пользователем.
3. Проверить чтение/сохранение shared-state на безопасной тестовой операции.
4. Проверить, что старые пользовательские данные не пропали.
5. Проверить, что кнопки сброса/восстановления пресета в `pilot` не выполняют destructive action без явного разрешения.

## Rollback к предыдущему коду

1. Не трогать shared-state директорию.
2. Активировать предыдущий известный release ID через
   `npm run release:activate:pilot -- --release-id=<previous-release-id>`.
3. Не выполнять `git reset`, `git pull` или ручную замену симлинка на
   работающем контуре.

## Restore данных из backup

Использовать только если shared-state действительно поврежден.

```bash
APP_ENV=pilot \
MES_SHARED_STATE_DIR=/srv/mes/pilot/shared-state \
MES_BACKUP_DIR=/srv/mes/pilot/backups \
MES_AUDIT_LOG_PATH=/srv/mes/pilot/audit/audit.log \
MES_RESTORE_CONFIRM=RESTORE_SHARED_STATE \
npm run restore:shared-state -- --backup=/srv/mes/pilot/backups/<backup-file>.json --actor=operator
```

Restore автоматически делает backup текущего состояния перед заменой.

## Запрещенные действия на пользовательском контуре

- Удалять `/srv/mes/pilot/shared-state`.
- Удалять `/srv/mes/pilot/backups`.
- Включать `MES_ALLOW_DESTRUCTIVE_ACTIONS=true` без отдельного окна обслуживания.
- Запускать seed/reset/import, который перезаписывает shared-state.
- Пересоздавать процесс с другим `MES_SHARED_STATE_DIR` без миграции данных.

## Минимальный healthcheck

```bash
curl -I https://pilot.mes-line.ru/
curl -s https://pilot.mes-line.ru/api/shared-state | head
```

Для закрытого контура endpoint может быть защищен reverse proxy; тогда healthcheck выполняется с сервера через `localhost`.

Автоматизированная проверка:

```bash
APP_BASE_URL=https://pilot.mes-line.ru npm run server:healthcheck
```
