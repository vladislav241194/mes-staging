# MES server deploy runbook

Цель: переносить прототип MES на сервер так, чтобы пользовательские данные тестового контура не удалялись при обновлениях.

## Контуры

Рекомендуемая схема на одной виртуальной машине:

- `dev` - внутренний контур без пользователей, можно чаще обновлять и ломать.
- `user-testing` - контур для начальника производства, мастеров и исполнителей. Данные сохраняются между релизами.

Минимальные переменные окружения для каждого процесса:

```bash
APP_ENV=dev
PORT=4174
MES_SHARED_STATE_DIR=/srv/mes/dev/shared-state
MES_BACKUP_DIR=/srv/mes/dev/backups
MES_AUDIT_LOG_PATH=/srv/mes/dev/audit/audit.log
APP_BASE_URL=https://dev.example.ru
```

```bash
APP_ENV=user-testing
PORT=4175
MES_SHARED_STATE_DIR=/srv/mes/user-testing/shared-state
MES_BACKUP_DIR=/srv/mes/user-testing/backups
MES_AUDIT_LOG_PATH=/srv/mes/user-testing/audit/audit.log
APP_BASE_URL=https://mes-test.example.ru
MES_ALLOW_DESTRUCTIVE_ACTIONS=false
MES_ENABLE_WORKFLOW_PRESET_RESTORE=false
```

## Перед первым запуском

1. Создать отдельного Linux-пользователя для сервиса, например `mes`.
2. Создать директории:

```bash
sudo mkdir -p /srv/mes/dev/shared-state /srv/mes/dev/backups /srv/mes/dev/audit
sudo mkdir -p /srv/mes/user-testing/shared-state /srv/mes/user-testing/backups /srv/mes/user-testing/audit
sudo chown -R mes:mes /srv/mes
```

3. Не хранить пользовательский shared-state внутри git checkout.
4. Не использовать `rm -rf` для shared-state, backup или audit директорий.

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

Для контура `user-testing`:

```bash
APP_ENV=user-testing \
MES_SHARED_STATE_DIR=/srv/mes/user-testing/shared-state \
MES_BACKUP_DIR=/srv/mes/user-testing/backups \
MES_AUDIT_LOG_PATH=/srv/mes/user-testing/audit/audit.log \
npm run backup:shared-state -- --reason=before-deploy --actor=deploy
```

Проверить список backup:

```bash
APP_ENV=user-testing \
MES_BACKUP_DIR=/srv/mes/user-testing/backups \
npm run list:shared-state-backups
```

## Deploy

1. Обновить код через безопасный способ, например `git pull --ff-only`.
2. Установить зависимости: `npm ci`.
3. Собрать приложение: `npm run build`.
4. Запустить нужный процесс:

```bash
APP_ENV=user-testing \
PORT=4175 \
MES_SHARED_STATE_DIR=/srv/mes/user-testing/shared-state \
MES_BACKUP_DIR=/srv/mes/user-testing/backups \
MES_AUDIT_LOG_PATH=/srv/mes/user-testing/audit/audit.log \
MES_ALLOW_DESTRUCTIVE_ACTIONS=false \
MES_ENABLE_WORKFLOW_PRESET_RESTORE=false \
npm run preview
```

На сервере лучше запускать через process manager, например `systemd` или `pm2`. Конфиг process manager должен хранить переменные окружения контура и не должен перетирать директории данных.

## Post-deploy QA

1. Открыть главную страницу контура.
2. Проверить вход под тестовым пользователем.
3. Проверить чтение/сохранение shared-state на безопасной тестовой операции.
4. Проверить, что старые пользовательские данные не пропали.
5. Проверить, что кнопки сброса/восстановления пресета в `user-testing` не выполняют destructive action без явного разрешения.

## Rollback к предыдущему коду

1. Не трогать shared-state директорию.
2. Откатить код на предыдущий commit/tag.
3. Выполнить `npm ci` и `npm run build`.
4. Перезапустить процесс с теми же переменными окружения.

## Restore данных из backup

Использовать только если shared-state действительно поврежден.

```bash
APP_ENV=user-testing \
MES_SHARED_STATE_DIR=/srv/mes/user-testing/shared-state \
MES_BACKUP_DIR=/srv/mes/user-testing/backups \
MES_AUDIT_LOG_PATH=/srv/mes/user-testing/audit/audit.log \
MES_RESTORE_CONFIRM=RESTORE_SHARED_STATE \
npm run restore:shared-state -- --backup=/srv/mes/user-testing/backups/<backup-file>.json --actor=operator
```

Restore автоматически делает backup текущего состояния перед заменой.

## Запрещенные действия на пользовательском контуре

- Удалять `/srv/mes/user-testing/shared-state`.
- Удалять `/srv/mes/user-testing/backups`.
- Включать `MES_ALLOW_DESTRUCTIVE_ACTIONS=true` без отдельного окна обслуживания.
- Запускать seed/reset/import, который перезаписывает shared-state.
- Пересоздавать процесс с другим `MES_SHARED_STATE_DIR` без миграции данных.

## Минимальный healthcheck

```bash
curl -I https://mes-test.example.ru/
curl -s https://mes-test.example.ru/api/shared-state | head
```

Для закрытого контура endpoint может быть защищен reverse proxy; тогда healthcheck выполняется с сервера через `localhost`.
