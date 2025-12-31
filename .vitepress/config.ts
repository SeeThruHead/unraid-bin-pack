import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Unraid Bin Pack',
  description: 'Consolidate files across Unraid disks using efficient bin-packing algorithms',

  srcDir: '.',

  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Domain', link: '/src/domain/WorldView' },
      { text: 'Services', link: '/src/services/BinPack/SimpleConsolidator' },
      { text: 'CLI', link: '/src/cli/handler' }
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Overview', link: '/' },
        ]
      },
      {
        text: 'Domain',
        collapsed: false,
        items: [
          { text: 'WorldView', link: '/src/domain/WorldView' },
          { text: 'MovePlan', link: '/src/domain/MovePlan' },
          { text: 'FileFilter', link: '/src/domain/FileFilter' },
          { text: 'FileEntry', link: '/src/domain/FileEntry' },
          { text: 'DiskProjection', link: '/src/domain/DiskProjection' },
          { text: 'DiskRanking', link: '/src/domain/DiskRanking' },
          { text: 'FolderGroup', link: '/src/domain/FolderGroup' },
          { text: 'FileOrderStrategy', link: '/src/domain/FileOrderStrategy' },
          { text: 'MoveOptimization', link: '/src/domain/MoveOptimization' },
          { text: 'ScoringStrategy', link: '/src/domain/ScoringStrategy' },
        ]
      },
      {
        text: 'Services',
        collapsed: false,
        items: [
          {
            text: 'BinPack',
            collapsed: true,
            items: [
              { text: 'SimpleConsolidator', link: '/src/services/BinPack/SimpleConsolidator' },
              { text: 'MoveGenerator', link: '/src/services/BinPack/MoveGenerator' },
            ]
          },
          {
            text: 'Data Collection',
            collapsed: true,
            items: [
              { text: 'ScannerService', link: '/src/services/ScannerService/ScannerService' },
              { text: 'DiskService', link: '/src/services/DiskService/DiskService' },
              { text: 'DiskStatsService', link: '/src/services/DiskStatsService/DiskStatsService' },
              { text: 'FileStatService', link: '/src/services/FileStatService/FileStatService' },
              { text: 'GlobService', link: '/src/services/GlobService/GlobService' },
            ]
          },
          {
            text: 'Execution',
            collapsed: true,
            items: [
              { text: 'PlanGenerator', link: '/src/services/PlanGenerator/PlanGenerator' },
              { text: 'PlanScriptGenerator', link: '/src/services/PlanScriptGenerator/PlanScriptGenerator' },
              { text: 'TransferService', link: '/src/services/TransferService/TransferService' },
            ]
          },
          {
            text: 'Infrastructure',
            collapsed: true,
            items: [
              { text: 'LoggerService', link: '/src/services/LoggerService/LoggerService' },
              { text: 'ShellService', link: '/src/services/ShellService/ShellService' },
              { text: 'TerminalUIService', link: '/src/services/TerminalUIService/TerminalUIService' },
            ]
          },
        ]
      },
      {
        text: 'CLI',
        collapsed: false,
        items: [
          { text: 'Handler', link: '/src/cli/handler' },
          { text: 'Interactive', link: '/src/cli/interactive' },
          { text: 'Options', link: '/src/cli/options' },
          { text: 'Errors', link: '/src/cli/errors' },
        ]
      }
    ],

    search: {
      provider: 'local'
    },

    editLink: {
      pattern: 'https://github.com/yourusername/unraid-bin-pack/edit/main/:path'
    }
  }
})
