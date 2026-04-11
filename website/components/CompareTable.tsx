const rows = [
  { feature: '注册登录', wechat: '需要', cloud: '需要', mostbox: '不需要' },
  { feature: '传输限速', wechat: '有限制', cloud: '有限制', mostbox: '不限速' },
  { feature: '文件大小', wechat: '有限制', cloud: '有限制', mostbox: '无限制' },
  { feature: '中心化', wechat: '是', cloud: '是', mostbox: '否 (P2P)' },
  { feature: '端到端加密', wechat: '否', cloud: '部分', mostbox: '是' },
  { feature: '开源', wechat: '否', cloud: '否', mostbox: 'MIT 协议' },
  { feature: '自托管', wechat: '否', cloud: '否', mostbox: '可以' },
]

export function CompareTable() {
  return (
    <section className="section">
      <div className="container">
        <h2 className="heading-section">为什么选择 MostBox？</h2>
        <table className="compare-table">
          <thead>
            <tr>
              <th></th>
              <th>微信/QQ</th>
              <th>网盘</th>
              <th className="highlight-col">MostBox</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.feature}>
                <td>{row.feature}</td>
                <td>{row.wechat}</td>
                <td>{row.cloud}</td>
                <td className="highlight-col">{row.mostbox}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}