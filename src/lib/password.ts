export const RECOMMENDED_PASSWORD_LENGTH = 18

/** 按字符数计（汉字算 1），非空且短于推荐长度时提示风险；不拦截登录。 */
export function isPasswordShort(password: string) {
  return (
    password.length > 0 && [...password].length < RECOMMENDED_PASSWORD_LENGTH
  )
}
