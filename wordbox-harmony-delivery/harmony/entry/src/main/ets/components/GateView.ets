/**
 * F-20 read-layer gate view (ArkUI). Rendered only from `Gated<T>.allowed ===
 * false`. It contains NO progress data: no numbers, no curves, no heatmap.
 * The page must not read any record/check-in before consulting the gate.
 */
@Component
export struct GateView {
  @Prop unlockHint: string = '登录华为账号，解锁进度';
  onLogin: () => void = () => {};

  build() {
    Column({ space: 12 }) {
      Text('🔒')
        .fontSize(46)
      Text('登录后可查看')
        .fontSize(20)
        .fontWeight(FontWeight.Bold)
      Text(this.unlockHint)
        .fontSize(14)
        .fontColor('#6B7280')
      Text('你仍可照常学习与打卡，进度数据已保存在本机。')
        .fontSize(13)
        .fontColor('#6B7280')
      Button('登录华为账号')
        .width('100%')
        .onClick(() => { this.onLogin(); })
    }
    .width('100%')
    .padding(30)
    .alignItems(HorizontalAlign.Center)
  }
}
