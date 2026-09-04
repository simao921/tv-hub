# TV Hub

## Servidor local para as boxes

O servidor não inclui canais, listas, credenciais ou streams. Inicia-o numa máquina ligada à mesma rede Wi-Fi/Ethernet das boxes:

```bash
node local/server.js
```

Depois abre nas boxes `http://IP-DA-MAQUINA:8787`, substituindo `IP-DA-MAQUINA` pelo endereço local dessa máquina (por exemplo, `192.168.1.20`). O firewall deve permitir ligações TCP na porta `8787`.

O backend descarrega a playlist enviada pelo utilizador, interpreta os metadados M3U e não guarda o URL. Categorias e canais marcados como adultos são excluídos por defeito.

Usa apenas uma playlist e streams para os quais tens autorização. O servidor não procura nem fornece listas de operadores, incluindo MEO.