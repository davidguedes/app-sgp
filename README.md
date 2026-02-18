# Sistema de Gerenciamento Pilates - Angular 21 + PrimeNG

## 📋 Visão Geral
Sistema completo para gerenciamento de estúdio de Pilates com controle de alunos, frequência, evoluções e relatórios.

## 🚀 Instalação

### 1. Criar o projeto Angular 21
```bash
npm install -g @angular/cli@21
ng new pilates-system --standalone
cd pilates-system
```

### 2. Instalar dependências
```bash
# PrimeNG e PrimeIcons
npm install primeng primeicons

# Xlsx para exportação Excel
npm install xlsx
npm install --save-dev @types/node

# Angular animations
npm install @angular/animations
```

### 3. Configurar angular.json
Adicione os estilos do PrimeNG no arquivo `angular.json`:

```json
"styles": [
  "src/styles.scss",
  "node_modules/primeng/resources/themes/lara-light-teal/theme.css",
  "node_modules/primeng/resources/primeng.min.css",
  "node_modules/primeicons/primeicons.css"
]
```

### 4. Configurar tsconfig.json
Adicione em `compilerOptions`:

```json
"types": ["node"],
"resolveJsonModule": true
```

### 5. Estrutura de pastas
```
src/
├── app/
│   ├── core/
│   │   ├── models/
│   │   │   ├── user.model.ts
│   │   │   ├── patient.model.ts
│   │   │   ├── attendance.model.ts
│   │   │   └── evolution.model.ts
│   │   ├── services/
│   │   │   ├── auth.service.ts
│   │   │   ├── patient.service.ts
│   │   │   ├── storage.service.ts
│   │   │   └── export.service.ts
│   │   └── guards/
│   │       └── auth.guard.ts
│   ├── features/
│   │   ├── auth/
│   │   │   └── login/
│   │   ├── dashboard/
│   │   ├── patients/
│   │   │   ├── patient-list/
│   │   │   ├── patient-form/
│   │   │   └── patient-details/
│   │   ├── calendar/
│   │   └── attendance/
│   ├── shared/
│   │   └── components/
│   └── app.routes.ts
```

## 🎨 Customização de Tema
O sistema usa cores personalizadas. Adicione ao `src/styles.scss`:

```scss
:root {
  --sage: #7a9e7e;
  --sage-light: #a8c5ab;
  --sage-dark: #4e6e52;
  --cream: #f8f5f0;
  --warm-white: #fdfcfa;
  --charcoal: #2c2c2c;
  --muted: #8a8580;
  --border: #e8e3dc;
  --accent: #c4956a;
  --accent-light: #f0e4d7;
}

// Sobrescrever cores do PrimeNG
.p-component {
  font-family: 'DM Sans', sans-serif;
}

.p-button {
  background-color: var(--sage-dark);
  border-color: var(--sage-dark);
  
  &:hover {
    background-color: var(--sage);
    border-color: var(--sage);
  }
}
```

## 🔧 Backend (Node.js + Express)
O backend deve fornecer as seguintes rotas:

### Autenticação
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Obter usuário atual

### Alunos (Patients)
- `GET /api/patients` - Listar alunos
- `GET /api/patients/:id` - Obter aluno
- `POST /api/patients` - Criar aluno
- `PUT /api/patients/:id` - Atualizar aluno
- `DELETE /api/patients/:id` - Excluir aluno

### Frequência
- `POST /api/patients/:id/attendance` - Registrar presença
- `PUT /api/patients/:id/attendance/:attendanceId` - Atualizar presença
- `DELETE /api/patients/:id/attendance/:attendanceId` - Remover registro

### Evoluções
- `GET /api/patients/:id/evolutions` - Listar evoluções
- `POST /api/patients/:id/evolutions` - Adicionar evolução
- `PUT /api/patients/:id/evolutions/:evolutionId` - Atualizar evolução
- `DELETE /api/patients/:id/evolutions/:evolutionId` - Remover evolução

### Profissionais
- `GET /api/professionals` - Listar profissionais

## 📦 Componentes PrimeNG Utilizados
- Table (p-table)
- Dialog (p-dialog)
- Calendar (p-calendar)
- Button (p-button)
- InputText (p-inputText)
- Dropdown (p-select)
- Toast (p-toast)
- Card (p-card)
- Toolbar (p-toolbar)
- Badge (p-badge)
- Tag (p-tag)
- Chart (p-chart)
- Menu (p-menu)

## 🏃 Executar o projeto
```bash
# Desenvolvimento
ng serve

# Build para produção
ng build --configuration production
```

## 📝 Credenciais de Teste
**Gestor:**
- Email: gestor@studio.com
- Senha: gestor123

**Profissional:**
- Email: prof@studio.com
- Senha: prof123

## 🔐 Segurança
- Implementar JWT para autenticação
- Validação de permissões no backend
- Sanitização de inputs
- CORS configurado corretamente

## 📊 Funcionalidades
✅ Login com níveis de acesso (Gestor/Profissional)
✅ CRUD completo de alunos
✅ Controle de frequência (presença/falta/reposição)
✅ Sistema de evoluções com histórico
✅ Calendário de aulas
✅ Dashboard com estatísticas
✅ Exportação para Excel
✅ Cálculo automático de ganhos
✅ Filtros e busca avançada
✅ Design responsivo