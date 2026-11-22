# System Monitor for BUSY Bar

Кроссплатформенный монитор потребления ресурсов (**Windows, macOS, Linux / SteamOS**) для настольного дисплея **BUSY Bar (72x16 RGB LED Matrix)**.

---

## 🔌 Как подключается BUSY Bar (COM-порт или Сеть?)

> **Важный нюанс аппаратной части BUSY Bar:**
> BUSY Bar при подключении проводом USB к компьютеру **не создаёт виртуальный COM-порт (Serial)**.
> Вместо этого встроенный микроконтроллер эмулирует **USB-Ethernet сетевую карту (CDC-NCM / RNDIS)**:
> - На компьютере автоматически появляется виртуальное сетевое соединение `10.0.4.x`.
> - Сам BUSY Bar всегда доступен по фиксированному адресу **`http://10.0.4.20`**.
>
> Это даёт огромное преимущество: **не нужны драйверы COM-портов**, нет проблем с занятыми портами и скорость передачи данных в разы выше.

---

## ⚡ Два удобных способа использования

### Вариант 1. Прямой виджет (Host Push)
1. Подключите BUSY Bar по USB к вашему ПК.
2. Запустите:
   ```bash
   node index.js
   ```
   *Скрипт сам увидит подключенный BUSY Bar на `10.0.4.20` и начнет передавать загрузку **CPU, GPU, RAM** в реальном времени.*

### Вариант 2. Нативное приложение на BUSY Bar (через меню APPS)
Приложение установлено прямо в память BUSY Bar:
1. Соберите и установите приложение на BUSY Bar:
   ```bash
   npm run build
   npm run app:install
   ```
2. Запустите фоновый сервер метрик на компьютере:
   ```bash
   npm run server
   ```
   *Сервер автоматически определяет свой IP в сети USB (`10.0.4.x`) и регистрирует его в настройках BUSY Bar.*

---

## 🐧 Автозапуск сервера в фоне на SteamOS (Steam Deck / Steam Machine)

В SteamOS пользовательские службы запускаются через **`systemd --user`**. Они работают как в режиме рабочего стола (Desktop Mode), так и в игровом режиме (Game Mode), и не сбрасываются при системных обновлениях SteamOS.

### Способ 1: Автоматический скрипт (рекомендуется)
Находясь в папке проекта на SteamOS, выполните:
```bash
./scripts/install-service.sh
```
Скрипт автоматически:
- Определит точный путь к `node` и директории проекта;
- Создаст юнит `~/.config/systemd/user/system-monitor.service`;
- Запустит службу и включит автозапуск при старте системы;
- Включит режим `linger`, чтобы служба запускалась сразу при включении консоли даже в Game Mode.

### Способ 2: Вручную
1. Скопируйте файл службы:
   ```bash
   mkdir -p ~/.config/systemd/user
   cp system-monitor.service ~/.config/systemd/user/
   ```

2. Включите и запустите:
   ```bash
   systemctl --user daemon-reload
   systemctl --user enable --now system-monitor.service
   ```

3. Чтобы служба стартовала при включении Steam Deck без входа в рабочий стол:
   ```bash
   loginctl enable-linger $USER
   ```

### Управление службой:
- **Проверить статус:**
  ```bash
  systemctl --user status system-monitor.service
  ```
- **Остановить:**
  ```bash
  systemctl --user stop system-monitor.service
  ```
- **Удалить из автозагрузки:**
  ```bash
  ./scripts/uninstall-service.sh
  ```

---

## 💻 Поддержка операционных систем

| ОС | CPU % | RAM % | GPU % | Сеть (NET) |
|---|---|---|---|---|
| **Windows** (10 / 11) | Да (`os.cpus` delta) | Да (Total / Free) | Да (NVIDIA + DirectX 3D Counters) | Да (`netstat -e`) |
| **macOS** (Apple Silicon / Intel) | Да (`os.cpus` delta) | Да (`vm_stat` / Mach Pages) | Да (дискретные / fallback) | Да (`netstat -ib`) |
| **Linux / SteamOS** (Steam Machine, Steam Deck) | Да (`/proc/stat`) | Да (`/proc/meminfo`) | Да (AMD `gpu_busy_percent` + NVIDIA) | Да (`/proc/net/dev`) |

---

## 🎮 Пресеты отображения

По умолчанию отображаются:
1. **CPU**: `[контур + цветная шкала]` `XX%`
2. **GPU**: `[контур + цветная шкала]` `XX%` *(если GPU не обнаружен — автоматически RAM или NET)*
3. **RAM**: `[контур + цветная шкала]` `XX%`

**Цвета индикатора:**
- Зелёный (`#22C55E`): нагрузка < 70%
- Оранжевый (`#F59E0B`): нагрузка 70% – 89%
- Красный (`#E60022`): нагрузка ≥ 90%

### Параметры CLI (`index.js`):
- `--mode auto` — автоопределение GPU (CPU / GPU / RAM)
- `--mode classic` — классический стиль (CPU / RAM / NET)
- `--mode temp` — с отображением температуры (CPU / GPU / TMP)
- `--mode vram` — с видеопамятью (CPU / GPU / VRAM)
- `--rows CPU,GPU,RAM` — произвольный выбор 3 строк
- `--back-display` — также выводить детальную инфо на задний OLED-экран (160×80)
- `--dry-run` — тестовый вывод метрик в консоль

---

## 🚀 Команды проекта

```bash
# Прямой виджет (Host Push)
npm run widget          # или node index.js

# Запуск фонового сервера метрик для нативного приложения
npm run server          # или node index.js --server

# Сборка пакета через busy-cli
npm run build           # создает dist/app.system.monitor.tgz

# Установка и запуск на BUSY Bar через busy-cli
npm run app:install
npm run app:run
npm run app:stop
```
